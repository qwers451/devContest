import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship

from app.database import Base


class ContestStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    finished = "finished"
    cancelled = "cancelled"


class ContestType(Base):
    __tablename__ = "contest_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)


class ContestTemplate(Base):
    __tablename__ = "contest_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    tz_template = Column(Text)


class Contest(Base):
    __tablename__ = "contests"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, nullable=False, index=True)
    type_id = Column(Integer, ForeignKey("contest_types.id"), nullable=True)
    template_id = Column(Integer, ForeignKey("contest_templates.id"), nullable=True)
    number = Column(Integer, unique=True, nullable=False, index=True)
    title = Column(String(300), nullable=False)
    annotation = Column(String(1000))
    description = Column(Text)
    tz_text = Column(Text)
    tz_filename = Column(String(300), nullable=True)
    prizepool = Column(Integer, nullable=False)
    status = Column(SAEnum(ContestStatus), default=ContestStatus.draft, nullable=False)
    files = Column(JSON, default=list)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    ends_at = Column(DateTime(timezone=True), nullable=False)

    current_stage_id = Column(Integer, nullable=True)
    prize_distribution = Column(JSON, default=lambda: [100])

    type = relationship("ContestType")
    template = relationship("ContestTemplate")
    stages = relationship(
        "ContestStage", back_populates="contest", cascade="all, delete-orphan"
    )
    submissions = relationship(
        "Submission", back_populates="contest", cascade="all, delete-orphan"
    )
    winner = relationship(
        "Winner",
        back_populates="contest",
        uselist=False,
        cascade="all, delete-orphan",
        single_parent=True,
    )
    awards = relationship(
        "ContestAward",
        back_populates="contest",
        cascade="all, delete-orphan",
        order_by="ContestAward.place",
    )


class ContestStage(Base):
    __tablename__ = "contest_stages"

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(Integer, ForeignKey("contests.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    deadline = Column(DateTime(timezone=True))
    order = Column(Integer, nullable=False)
    prize_amount = Column(Integer, default=0, nullable=False)

    contest = relationship("Contest", back_populates="stages")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(Integer, ForeignKey("contests.id"), nullable=False, index=True)
    executor_id = Column(Integer, nullable=False, index=True)
    number = Column(Integer, unique=True, nullable=False, index=True)
    title = Column(String(300), nullable=False)
    annotation = Column(String(1000))
    description = Column(Text)
    files = Column(JSON, default=list)
    status = Column(Integer, default=1, nullable=False)
    ai_score = Column(Float, nullable=True)
    critical_issues = Column(Boolean, nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    contest = relationship("Contest", back_populates="submissions")
    reviews = relationship(
        "Review", back_populates="submission", cascade="all, delete-orphan"
    )
    status_logs = relationship(
        "SubmissionStatusLog", back_populates="submission", cascade="all, delete-orphan"
    )


class SubmissionStatusLog(Base):
    __tablename__ = "submission_status_logs"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    old_status = Column(Integer, nullable=True)
    new_status = Column(Integer, nullable=False)
    changed_by_id = Column(Integer, nullable=True)
    changed_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    submission = relationship("Submission", back_populates="status_logs")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(
        Integer, ForeignKey("submissions.id"), nullable=False, index=True
    )
    reviewer_id = Column(Integer, nullable=False)
    number = Column(Integer, nullable=False)
    score = Column(Float, nullable=False)
    commentary = Column(Text)
    files = Column(JSON, default=list)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    submission = relationship("Submission", back_populates="reviews")


class Winner(Base):
    __tablename__ = "winners"

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(Integer, ForeignKey("contests.id"), unique=True, nullable=False)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    executor_id = Column(Integer, nullable=False)
    selected_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    contest = relationship("Contest", back_populates="winner")
    submission = relationship("Submission")


class ContestAward(Base):
    """Призовое место конкурса (1..N) и сумма, выплаченная за него."""

    __tablename__ = "contest_awards"
    __table_args__ = (
        UniqueConstraint("contest_id", "place", name="uq_award_contest_place"),
        UniqueConstraint(
            "contest_id", "submission_id", name="uq_award_contest_submission"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(
        Integer, ForeignKey("contests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    place = Column(Integer, nullable=False)
    submission_id = Column(
        Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False
    )
    executor_id = Column(Integer, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    net_amount = Column(Numeric(12, 2), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    contest = relationship("Contest", back_populates="awards")
    submission = relationship("Submission")


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("contest_id", "executor_id", name="uq_conversation_contest_executor"),
    )

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(Integer, ForeignKey("contests.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id = Column(Integer, nullable=False, index=True)
    executor_id = Column(Integer, nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_message_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    contest = relationship("Contest")
    messages = relationship(
        "ChatMessage", back_populates="conversation", cascade="all, delete-orphan"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    read_at = Column(DateTime(timezone=True), nullable=True)

    conversation = relationship("Conversation", back_populates="messages")
