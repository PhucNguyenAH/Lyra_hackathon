"""Validated contracts for interview generation, turns, persistence, and reports."""

from datetime import UTC, datetime
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


class InterviewStage(str, Enum):
    PHONE_SCREEN = "phone_screen"
    EXPERIENCE_TECHNICAL = "experience_technical"


class HiringStageCategory(str, Enum):
    PHONE_SCREEN = "phone_screen"
    EXPERIENCE_TECHNICAL = "experience_technical"
    CODING_ASSESSMENT = "coding_assessment"
    ONSITE = "onsite"
    OTHER = "other"


class HiringStageEvidence(BaseModel):
    url: str
    title: str


class HiringStage(BaseModel):
    name: str
    category: HiringStageCategory
    description: str
    evidence: list[HiringStageEvidence] = Field(default_factory=list, max_length=3)
    confidence: float = Field(ge=0, le=1)
    practice_supported: bool


class HiringProcessResearch(BaseModel):
    company: str
    job_title: str
    summary: str
    stages: list[HiringStage] = Field(min_length=1, max_length=8)
    researched_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    confidence: float = Field(ge=0, le=1)


class HiringProcessRequest(BaseModel):
    company: str = Field(min_length=1, max_length=300)
    job_title: str = Field(min_length=1, max_length=300)
    job_url: str | None = Field(default=None, max_length=2_000)


class SessionEventType(str, Enum):
    SESSION_STARTED = "session_started"
    ANSWER_SUBMITTED = "answer_submitted"
    HINT_REQUESTED = "hint_requested"
    TOPIC_SKIPPED = "topic_skipped"
    TIMEOUT = "timeout"
    PAUSED = "paused"
    RESUMED = "resumed"
    FINISHED_EARLY = "finished_early"
    ABANDONED = "abandoned"


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


class DeliveryEvidence(BaseModel):
    """Observable speaking signals captured with a recorded answer."""

    duration_seconds: float = Field(gt=0, le=300)
    word_count: int = Field(ge=0)
    words_per_minute: float = Field(ge=0, le=400)
    filler_words: int = Field(ge=0)
    transcript_source: str = Field(default="groq_whisper", pattern="^(groq_whisper|typed)$")


class TurnRecord(BaseModel):
    topic_id: str
    answer: str
    delivery: DeliveryEvidence | None = None
    analysis: TurnAnalysis
    move: NextMove


class SessionEvent(BaseModel):
    type: SessionEventType
    at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    topic_id: str | None = None
    detail: dict[str, object] = Field(default_factory=dict)


class InterviewState(BaseModel):
    current_topic_index: int = Field(default=0, ge=0)
    topic_states: list[TopicState]
    messages: list[ChatMessage] = Field(default_factory=list)
    turns: list[TurnRecord] = Field(default_factory=list)
    events: list[SessionEvent] = Field(default_factory=list)


class WeakTopic(BaseModel):
    topic: str
    why_weak: str
    drill_suggestion: str


class ScoreEvidence(BaseModel):
    dimension: str = Field(pattern="^(specificity|technical_depth|communication|handling_pressure)$")
    score: int = Field(ge=1, le=5)
    evidence: str


class CVCoachingSuggestion(BaseModel):
    """An interview gap tied to one exact, existing master-profile bullet."""

    item_id: str
    source_bullet: str
    issue: str = Field(pattern="^(missing_metric|unclear_ownership|weak_result|weak_tradeoff|unclear_scope)$")
    suggestion: str
    interview_evidence: str


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
    score_evidence: list[ScoreEvidence] = Field(default_factory=list, max_length=4)
    cv_suggestions: list[CVCoachingSuggestion] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def score_evidence_matches_scores(self) -> "FeedbackReport":
        if not self.score_evidence:
            return self
        expected = self.scores.model_dump()
        supplied = {item.dimension: item.score for item in self.score_evidence}
        if supplied != expected:
            raise ValueError("score_evidence must contain one matching entry for every score")
        return self


class SessionConfig(BaseModel):
    user_id: str
    job_description: str | None = None
    role_level: str | None = None
    interview_stage: InterviewStage = InterviewStage.EXPERIENCE_TECHNICAL
    job_title: str | None = Field(default=None, max_length=300)
    company: str | None = Field(default=None, max_length=300)
    cv_draft_id: str | None = Field(default=None, max_length=300)
    hiring_process: HiringProcessResearch | None = None
    topics: list[Topic] = Field(min_length=6, max_length=8)


class SessionStatus(str, Enum):
    ACTIVE = "active"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    FAILED = "failed"
    ABANDONED = "abandoned"


class InterviewSession(BaseModel):
    id: str
    config: SessionConfig
    state: InterviewState
    status: SessionStatus


class SessionSummary(BaseModel):
    """One row of a user's real practice history, for the recent-practice list."""

    id: str
    job_title: str | None = None
    company: str | None = None
    cv_draft_id: str | None = None
    created_at: str
    report: FeedbackReport


class CreateSessionRequest(BaseModel):
    user_id: str
    job_description: str | None = None
    role_level: str | None = Field(default=None, max_length=200)
    cv_text: str | None = Field(default=None, min_length=1, max_length=100_000)
    interview_stage: InterviewStage = InterviewStage.EXPERIENCE_TECHNICAL
    job_title: str | None = Field(default=None, max_length=300)
    company: str | None = Field(default=None, max_length=300)
    cv_draft_id: str | None = Field(default=None, max_length=300)
    hiring_process: HiringProcessResearch | None = None


class AnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=20_000)
    delivery: DeliveryEvidence | None = None


class TranscriptionResponse(BaseModel):
    text: str = Field(min_length=1)
    duration_seconds: float | None = Field(default=None, ge=0)


class SessionEventRequest(BaseModel):
    type: SessionEventType
    detail: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def only_client_lifecycle_events(self) -> "SessionEventRequest":
        if self.type not in {SessionEventType.PAUSED, SessionEventType.RESUMED}:
            raise ValueError("Only pause and resume events can be recorded directly")
        return self


class AbandonSessionRequest(BaseModel):
    reason: str = Field(default="candidate_quit", min_length=1, max_length=300)


class AnswerResponse(BaseModel):
    interviewer_message: str
    verdict: AnswerVerdict
    move: NextMove
    session_complete: bool


class SkipResponse(BaseModel):
    interviewer_message: str
    session_complete: bool


class ReportResponse(BaseModel):
    status: SessionStatus
    report: FeedbackReport | None = None
