"""FastAPI 入口 — 直接运行: python main.py  或  python app/main.py"""

import os
import sys

# 确保 backend/ 目录在 Python 搜索路径中
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.router import router

# 加载 .env 环境变量
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

app = FastAPI(
    title="CodePulse AI — PR Review Backend",
    version="1.0.0",
)

# CORS 中间件 — 允许前端 localhost:5173 跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由，所有接口前缀 /api
app.include_router(router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "CodePulse AI Backend is running 🚀"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
