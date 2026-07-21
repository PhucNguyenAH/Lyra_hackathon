"""Standalone development server for the interview API."""

from fastapi import FastAPI

from interview.router import configure_interview


app = FastAPI(title="Lyra AI Interviewer")
configure_interview(app)
