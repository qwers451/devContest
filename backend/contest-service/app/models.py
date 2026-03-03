import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Enum as SAEnum, Float, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


class ContestStatus(str, enum.Enum):
    draft     = "draft"
    active    = "active"
    finished  = "finished"
    cancelled = "cancelled"


class ContestType(Base):
    __tablename__ = "contest_types"

    id   = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)


class ContestTemplate(Base):
    __tablename__ = "contest_templates"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text)
    tz_template = Column(Text)


class Contest(Base):
    __tablename__ = "contests"

    id          = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, nullable=False, index=True)
    type_id     = Column(Integer, ForeignKey("contest_types.id"), nullable=True)
    template_id = Column(Integer, ForeignKey("contest_templates.id"), nullable=True)
    number      = Column(Integer, unique=True, nullable=False, index=True)
    title       = Column(String(300), nullable=False)
    annotation  = Column(String(1000))
    description = Column(Text)
    tz_text     = Column(Text)
    prizepool   = Column(Integer, nullable=False)
    status      = Column(SAEnum(ContestStatus), default=ContestStatus.draft, nullable=False)
    files       = Column(JSON, default=list)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ends_at     = Column(DateTime(timezone=True), nullable=False)

    type        = relationship("ContestType")
    template    = relationship("ContestTemplate")
    stages      = relationship("ContestStage", back_populates="contest", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="contest", cascade="all, delete-orphan")
    winner      = relationship("Winner", back_populates="contest", uselist=False)


class ContestStage(Base):
    __tablename__ = "contest_stages"

    id          = Column(Integer, primary_key=True, index=True)
    contest_id  = Column(Integer, ForeignKey("contests.id"), nullable=False)
    name        = Column(String(200), nullable=False)
    description = Column(Text)
    deadline    = Column(DateTime(timezone=True))
    order       = Column(Integer, nullable=False)

    contest     = relationship("Contest", back_populates="stages")


class Submission(Base):
    __tablename__ = "submissions"

    id          = Column(Integer, primary_key=True, index=True)
    contest_id  = Column(Integer, ForeignKey("contests.id"), nullable=False, index=True)
    executor_id = Column(Integer, nullable=False, index=True)
    number      = Column(Integer, unique=True, nullable=False, index=True)
    title       = Column(String(300), nullable=False)
    annotation  = Column(String(1000))
    description = Column(Text)
    files       = Column(JSON, default=list)
    status      = Column(Integer, default=1, nullable=False)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    contest     = relationship("Contest", back_populates="submissions")
    reviews     = relationship("Review", back_populates="submission", cascade="all, delete-orphan")


class Review(Base):
    __tablename__ = "reviews"

    id            = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    reviewer_id   = Column(Integer, nullable=False)
    number        = Column(Integer, nullable=False)
    score         = Column(Float, nullable=False)
    commentary    = Column(Text)
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    submission    = relationship("Submission", back_populates="reviews")


class Winner(Base):
    __tablename__ = "winners"

    id            = Column(Integer, primary_key=True, index=True)
    contest_id    = Column(Integer, ForeignKey("contests.id"), unique=True, nullable=False)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    executor_id   = Column(Integer, nullable=False)
    selected_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    contest       = relationship("Contest", back_populates="winner")
    submission    = relationship("Submission")
