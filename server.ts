import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize server-side Gemini client
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

// Helper to extract repo info from a GitHub PR URL
function parseGitHubPR(url: string) {
  try {
    const trimmed = url.trim();
    // Regex matching both HTTPS and standard SSH/HTTPS formats: github.com/owner/repo/pull/number
    const match = trimmed.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/i);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
        number: match[3],
      };
    }
  } catch (e) {
    console.error("PR URL parse error:", e);
  }
  return null;
}

// Route to handle PR analysis
app.post("/api/analyze-pr", async (req, res) => {
  try {
    const { prUrl, files, templateName } = req.body;

    if (!ai) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured. Please add it to your secrets panel.",
      });
    }

    let searchMetadata: any = {
      title: "更新身份验证流程与中间件",
      repo: "acme-corp/frontend-app #420",
      author: "dev_sarah",
      authorAvatar: "",
      filesCount: 4,
    };

    let filesToAnalyze: Array<{ filename: string; content: string }> = [];

    // 1. Try resolving GitHub URL if present
    const parsed = prUrl ? parseGitHubPR(prUrl) : null;
    let gitHubFetchSucceeded = false;
    let gitHubFetchError = "";

    if (parsed) {
      const { owner, repo, number } = parsed;
      searchMetadata.repo = `${owner}/${repo} #${number}`;
      searchMetadata.title = `GitHub Pull Request #${number}`;

      try {
        // Fetch Pull Request details
        const prResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
          headers: { "User-Agent": "Lumina-AI-PR-Review-Assistant" },
        });

        if (prResponse.ok) {
          const prData = await prResponse.json();
          searchMetadata.title = prData.title || searchMetadata.title;
          searchMetadata.author = prData.user?.login || searchMetadata.author;
          searchMetadata.authorAvatar = prData.user?.avatar_url || "";
          searchMetadata.filesCount = prData.changed_files || 0;

          // Fetch Pull Request Files
          const filesResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files`, {
            headers: { "User-Agent": "Lumina-AI-PR-Review-Assistant" },
          });

          if (filesResponse.ok) {
            const filesData = await filesResponse.json();
            for (const file of filesData) {
              // Get standard raw chunk or full code if small enough
              // Since the pull/files gives patches, we can analyze the patch as the code or try to get raw
              if (file.filename && (file.patch || file.raw_url)) {
                filesToAnalyze.push({
                  filename: file.filename,
                  content: file.patch || `// File changed: ${file.filename}\n// Modifies: ${file.blob_url}`,
                });
              }
            }
            gitHubFetchSucceeded = filesToAnalyze.length > 0;
          }
        } else {
          gitHubFetchError = `GitHub API responded with status ${prResponse.status}. It may be a private repository or rate-limited.`;
        }
      } catch (err: any) {
        console.error("Error fetching repository details directly:", err);
        gitHubFetchError = err.message || String(err);
      }
    }

    // 2. If it is high-level sandbox or custom files, use them
    if (!gitHubFetchSucceeded && files && files.length > 0) {
      filesToAnalyze = files;
      searchMetadata.filesCount = files.length;
      if (templateName) {
        searchMetadata.title = templateName;
        searchMetadata.repo = "sandbox/sandbox-app #3";
        searchMetadata.author = "sandbox_reviewer";
      } else {
        searchMetadata.title = "自定义代码分析";
        searchMetadata.repo = "local-workspace/custom-code";
        searchMetadata.author = "local_developer";
      }
      gitHubFetchSucceeded = true;
    }

    // 3. Fallback: If we had a GitHub PR URL but it failed or wasn't provided, and we don't have custom files,
    // let's have Gemini generate a realistic simulation representing that repo or a mock PR with realistic bugs!
    // This maintains zero-failure UX.
    let systemPromptAndContext = "";
    if (!gitHubFetchSucceeded) {
      systemPromptAndContext = `The user requested analysis for GitHub PR URL: "${prUrl || ""}".
Since we could not fetch direct files from this URL (e.g., due to authentication, private repo status, or missing token), please generate a highly realistic set of files, risks, and suggestions representing this repository or standard enterprise scenarios.
Generate 3 to 4 realistic files, with at least one having a clear security vulnerability or bug (e.g., JWT missing checks, memory leak, SQL injection, resource leak). Use a title like "${searchMetadata.title}" or infer one from the repo name. Make the review insightful, teaching-focused, and detailed.`;
    } else {
      systemPromptAndContext = `Analyze the provided files from the Pull Request. Provide an authoritative code review. Include overall summary, risk items, change files list, and concrete actionable suggestions with diff code snippets.`;
    }

    // Call Gemini API to perform structural code analysis
    const prompt = `
Please analyze the following PR environment context and code files. Provide a structured review response.

CONTEXT:
${JSON.stringify(searchMetadata)}

FILES TO ANALYZE:
${JSON.stringify(filesToAnalyze)}

${systemPromptAndContext}

Please return the results matching the specified JSON schema structure.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: `You are Lumina AI, a world-class principal software engineer and cyber security specialist.
Perform a strict code quality, architecture, performance, and security review.
Ensure code diffs in recommendations are correct, valid, elegant, and styled with git-like line differences.
When generating diffs, use format:
\`\`\`diff
- old-line
+ new-line
\`\`\`
Keep explanations concise, encouraging, and precise. Speak in clear, professional, natural, high-fidelity Chinese (Simplified), matching the tone in CodePulse AI of "智能制造卓越工程".`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Title of the PR or the analysis" },
            repo: { type: Type.STRING, description: "Repository and PR number string" },
            author: { type: Type.STRING, description: "Author of the PR" },
            authorAvatar: { type: Type.STRING, description: "GitHub or representative avatar URL" },
            filesCount: { type: Type.INTEGER, description: "Files count analyzed" },
            summary: { type: Type.STRING, description: "AI Executive Summary of the code review" },
            risks: {
              type: Type.ARRAY,
              description: "High level identified risks in the PR",
              items: {
                type: Type.OBJECT,
                properties: {
                  level: { type: Type.STRING, description: "high, medium, or low" },
                  message: { type: Type.STRING, description: "Short description of the risk" },
                },
                required: ["level", "message"],
              },
            },
            changedFiles: {
              type: Type.ARRAY,
              description: "List of files that were changed or simulated",
              items: {
                type: Type.OBJECT,
                properties: {
                  filename: { type: Type.STRING, description: "Name/Path of the file" },
                  riskLevel: { type: Type.STRING, description: "high, medium, low, or none" },
                  content: { type: Type.STRING, description: "The content of the file or the patch analyzed" },
                },
                required: ["filename", "riskLevel", "content"],
              },
            },
            suggestions: {
              type: Type.ARRAY,
              description: "Concrete actionable refactoring suggestions",
              items: {
                type: Type.OBJECT,
                properties: {
                  file: { type: Type.STRING, description: "Filename this suggestion applies to" },
                  title: { type: Type.STRING, description: "A highly concise title of the suggestions" },
                  description: { type: Type.STRING, description: "Short summary explaining what the suggestion is" },
                  severity: { type: Type.STRING, description: "critical, warning, or info" },
                  originalCode: { type: Type.STRING, description: "The original buggy or old code block to replace" },
                  revisedCode: { type: Type.STRING, description: "The revised clean code block (ideally with diff format + / -)" },
                  explanation: { type: Type.STRING, description: "In-depth explanation about this fix and why it matters" },
                },
                required: ["file", "title", "description", "severity", "originalCode", "revisedCode", "explanation"],
              },
            },
          },
          required: ["title", "repo", "author", "filesCount", "summary", "risks", "changedFiles", "suggestions"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response text received from Gemini.");
    }

    const payload = JSON.parse(resultText.trim());
    return res.json({
      success: true,
      data: payload,
      isSimulated: !gitHubFetchSucceeded && !files,
      gitHubError: gitHubFetchError || null,
    });
  } catch (error: any) {
    console.error("PR Analysis failed:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "An expected error occurred during analysis.",
    });
  }
});

// Serve static elements in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
