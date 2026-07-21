"""Validated contracts for interview generation, turns, persistence, and reports."""

from enum import Enum

from pydantic import BaseModel, Field, model_validator


class QuestionType(str, Enum):
    BEHAVIORAL = "behavioral"
    TECHNICAL = "technical"
    COMPANY_DOMAIN = "company_domain"


class AnswerVerdict(str, Enum):
    SOLID = "solid"
    VAGUE = "vague"
    STUCK = "stuck"


class NextMove(str, Enum):
    FOLLOW_UP = "follow_up"
    HINT = "hint"
    NEXT_TOPIC = "next_topic"
    COMPLETE = "complete"


class Topic(BaseModel):
    id: str
    type: QuestionType
    title: str
    opening_question: str
    what_good_looks_like: list[str] = Field(min_length=2, max_length=3)
    callback: str | None = None


class TurnAnalysis(BaseModel):
    verdict: AnswerVerdict
    weakest_point: str | None = None
    reasoning: str = Field(min_length=1)
    interviewer_message: str = Field(min_length=1)

    @model_validator(mode="after")
    def weakest_point_matches_verdict(self) -> "TurnAnalysis":
        if self.verdict is AnswerVerdict.VAGUE and not self.weakest_point:
            raise ValueError("Vague answers require a single weakest_point")
        if self.verdict is not AnswerVerdict.VAGUE:
            self.weakest_point = None
        return self


class TopicState(BaseModel):
    topic_id: str
    followup_count: int = Field(default=0, ge=0, le=2)
    hint_count: int = Field(default=0, ge=0, le=2)
    answer_count: int = Field(default=0, ge=0)
    completed: bool = False


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(interviewer|candidate)$")
    content: str = Field(min_length=1)


class TurnRecord(BaseModel):
    topic_id: str
    answer: str
    analysis: TurnAnalysis
    move: NextMove


class InterviewState(BaseModel):
    current_topic_index: int = Field(default=0, ge=0)
    topic_states: list[TopicState]
    messages: list[ChatMessage] = Field(default_factory=list)
    turns: list[TurnRecord] = Field(default_factory=list)


class WeakTopic(BaseModel):
    topic: str
    why_weak: str
    drill_suggestion: str


class ReportScores(BaseModel):
    specificity: int = Field(ge=1, le=5)
    technical_depth: int = Field(ge=1, le=5)
    communication: int = Field(ge=1, le=5)
    handling_pressure: int = Field(ge=1, le=5)


class TopicFeedback(BaseModel):
    topic_id: str
    verdict_summary: str
    what_they_said: str
    what_was_missing: str
    stronger_answer: str


class FeedbackReport(BaseModel):
    overall: str
    scores: ReportScores
    per_topic: list[TopicFeedback]
    weak_topics: list[WeakTopic] = Field(min_length=2, max_length=3)
    one_thing: str


class SessionConfig(BaseModel):
    user_id: str
    job_description: str | None = None
    topics: list[Topic] = Field(min_length=6, max_length=8)


class SessionStatus(str, Enum):
    ACTIVE = "active"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    FAILED = "failed"


class InterviewSession(BaseModel):
    id: str
    config: SessionConfig
    state: InterviewState
    status: SessionStatus


class CreateSessionRequest(BaseModel):
    user_id: str
    job_description: str | None = None


class AnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=20_000)


class AnswerResponse(BaseModel):
    interviewer_message: str
    verdict: AnswerVerdict
    move: NextMove
    session_complete: bool


class ReportResponse(BaseModel):
    status: SessionStatus
    report: FeedbackReport | None = None
