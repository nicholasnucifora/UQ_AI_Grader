import logging

import anthropic
from app.core.config import settings

logger = logging.getLogger(__name__)


class AIService:
    """Wraps the Anthropic client. All AI grading logic lives here."""

    def __init__(self):
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def _resolve_model(self, tier: str | None) -> str:
        """Resolve a tier name ('haiku', 'sonnet', 'opus') to the actual model ID from settings."""
        mapping = {
            "haiku": settings.anthropic_haiku,
            "sonnet": settings.anthropic_sonnet,
            "opus": settings.anthropic_opus,
        }
        return mapping.get(tier or "haiku", settings.anthropic_haiku)

    _DEFAULT_FEEDBACK_FORMAT = (
        "Be direct and accurate. Award the level the work genuinely deserves — "
        "do not soften grades. If a criterion is not met at all, award 0. "
        "If it fully meets the top standard, award full marks."
    )

    def _build_context_section(self, context: dict | None) -> str:
        """Build a grading context block from assignment/class metadata."""
        if not context:
            return ""
        parts = []
        if context.get("class_description"):
            parts.append(f"**Course context:** {context['class_description']}")
        if context.get("assignment_description"):
            parts.append(f"**Assignment:** {context['assignment_description']}")
        if context.get("marking_criteria"):
            parts.append(f"**Marking guidance:** {context['marking_criteria']}")
        if context.get("additional_notes"):
            parts.append(f"**Additional instructions:** {context['additional_notes']}")
        if not parts:
            return ""
        return "## Grading Context\n\n" + "\n\n".join(parts) + "\n\n"

    def _build_topic_attachments_section(
        self,
        topic_attachments: list[dict] | None,
        instructions: str,
    ) -> str:
        """Build a section for topic-specific reference attachments."""
        if not topic_attachments:
            return ""
        header = "## Topic Reference Materials\n\n"
        if instructions:
            header += f"{instructions}\n\n"
        parts = []
        for a in topic_attachments:
            if a.get("content_text", "").strip():
                parts.append(f"### {a['filename']}\n\n{a['content_text'].strip()}")
        if not parts:
            return ""
        return header + "\n\n".join(parts) + "\n\n"

    def grade_submission(
        self,
        sections: list[str],
        rubric: dict,
        context: dict | None = None,
        model: str | None = None,
        feedback_format: str = "",
        topic_attachments: list[dict] | None = None,
        topic_attachment_instructions: str = "",
    ) -> dict:
        """
        Grade student content sections against a rubric using Claude Tool Use.
        Returns: {"criterion_grades": [...], "overall_feedback": "..."}
        context: optional dict with class_description, assignment_description,
                 marking_criteria, additional_notes.
        """
        feedback_instruction = feedback_format.strip() or self._DEFAULT_FEEDBACK_FORMAT

        grade_tool = {
            "name": "submit_grade",
            "description": (
                "Submit the complete grading result for this student submission. "
                "Call this tool exactly once with grades for every criterion."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "criterion_grades": {
                        "type": "array",
                        "description": "One entry per rubric criterion.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "criterion_id": {
                                    "type": "string",
                                    "description": "The criterion id from the rubric.",
                                },
                                "criterion_name": {
                                    "type": "string",
                                    "description": "The criterion name.",
                                },
                                "level_id": {
                                    "type": "string",
                                    "description": "The id of the awarded performance level.",
                                },
                                "level_title": {
                                    "type": "string",
                                    "description": "The title of the awarded performance level.",
                                },
                                "points_awarded": {
                                    "type": "number",
                                    "description": "Points awarded for this criterion.",
                                },
                                "feedback": {
                                    "type": "string",
                                    "description": "Specific feedback for this criterion: explain why this level was awarded. If it is not the top level, explain what would be needed to achieve full marks.",
                                },
                            },
                            "required": [
                                "criterion_id",
                                "criterion_name",
                                "level_id",
                                "level_title",
                                "points_awarded",
                                "feedback",
                            ],
                        },
                    },
                },
                "required": ["criterion_grades"],
            },
        }

        rubric_md = self.format_rubric_to_markdown(rubric)
        context_section = self._build_context_section(context)
        attachments_section = self._build_topic_attachments_section(
            topic_attachments, topic_attachment_instructions
        )

        content_block = "\n\n".join(
            f"### Section {i + 1}\n{s}" for i, s in enumerate(sections)
        )

        system_prompt = (
            "You are an expert academic grader. "
            "Grade the student submission against the rubric using the submit_grade tool.\n\n"
            f"Feedback format: {feedback_instruction}\n\n"
            f"{context_section}"
            f"{attachments_section}"
            f"{rubric_md}"
        )

        use_thinking = model in ("sonnet", "opus")
        max_tokens = 10048 if use_thinking else 2048
        extra: dict = {}
        if use_thinking:
            extra["thinking"] = {"type": "enabled", "budget_tokens": 8000}

        # Forced tool_choice is incompatible with extended thinking; use auto instead
        # (the tool is still reliably called since it's the only one and the prompt instructs it)
        tool_choice = {"type": "auto"} if use_thinking else {"type": "tool", "name": "submit_grade"}

        last_exc: Exception = ValueError("grade_submission: no attempts made")
        for attempt in range(3):
            if attempt > 0:
                logger.warning("grade_submission: retry %d/2 (prev error: %s)", attempt, last_exc)
            response = self._client.messages.create(
                model=self._resolve_model(model),
                max_tokens=max_tokens,
                system=[{
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }],
                tools=[grade_tool],
                tool_choice=tool_choice,
                messages=[{"role": "user", "content": f"## Student Submission\n\n{content_block}"}],
                **extra,
            )
            for block in response.content:
                if block.type == "tool_use" and block.name == "submit_grade":
                    if block.input.get("criterion_grades"):
                        return block.input
                    last_exc = ValueError("AI returned empty criterion_grades — no criteria were graded")
                    break
            else:
                last_exc = ValueError("Claude did not return a grade tool call")

        raise last_exc

    def grade_moderation(
        self,
        moderation_comment: str,
        original_sections: list[str],
        rubric: dict,
        context: dict | None = None,
        model: str | None = None,
        feedback_format: str = "",
    ) -> dict:
        """
        Grade a moderation comment against the rubric.
        The original resource sections are provided as context so the AI can
        assess how well the moderator engaged with and understood the submission.
        Returns the same shape as grade_submission.
        """
        feedback_instruction = feedback_format.strip() or self._DEFAULT_FEEDBACK_FORMAT

        grade_tool = {
            "name": "submit_grade",
            "description": (
                "Submit the complete grading result for this moderation comment. "
                "Call this tool exactly once with grades for every criterion."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "criterion_grades": {
                        "type": "array",
                        "description": "One entry per rubric criterion.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "criterion_id": {"type": "string"},
                                "criterion_name": {"type": "string"},
                                "level_id": {"type": "string"},
                                "level_title": {"type": "string"},
                                "points_awarded": {"type": "number"},
                                "feedback": {"type": "string"},
                            },
                            "required": [
                                "criterion_id", "criterion_name", "level_id",
                                "level_title", "points_awarded", "feedback",
                            ],
                        },
                    },
                },
                "required": ["criterion_grades"],
            },
        }

        rubric_md = self.format_rubric_to_markdown(rubric)
        context_section = self._build_context_section(context)

        original_block = "\n\n".join(
            f"### Section {i + 1}\n{s}" for i, s in enumerate(original_sections)
        )

        system_prompt = (
            "You are an expert academic grader. "
            "You are grading a student's moderation comment. "
            "The student was asked to review a peer's submission and provide constructive feedback. "
            "Grade the moderation comment against the rubric criteria — assess how well the student's "
            "feedback demonstrates understanding and engages meaningfully with the subject matter. "
            "Treat the moderation comment as the primary work being graded. "
            "The original submission is provided only as context so you can judge the quality of the moderation.\n\n"
            f"Feedback format: {feedback_instruction}\n\n"
            f"{context_section}"
            f"{rubric_md}"
        )

        user_message = (
            f"## Original Submission (context only — do not grade this)\n\n{original_block}\n\n"
            f"## Moderation Comment (grade this)\n\n{moderation_comment}"
        )

        use_thinking = model in ("sonnet", "opus")
        max_tokens = 10048 if use_thinking else 2048
        extra: dict = {}
        if use_thinking:
            extra["thinking"] = {"type": "enabled", "budget_tokens": 8000}

        tool_choice = {"type": "auto"} if use_thinking else {"type": "tool", "name": "submit_grade"}

        last_exc: Exception = ValueError("grade_moderation: no attempts made")
        for attempt in range(3):
            if attempt > 0:
                logger.warning("grade_moderation: retry %d/2 (prev error: %s)", attempt, last_exc)
            response = self._client.messages.create(
                model=self._resolve_model(model),
                max_tokens=max_tokens,
                system=[{
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }],
                tools=[grade_tool],
                tool_choice=tool_choice,
                messages=[{"role": "user", "content": user_message}],
                **extra,
            )
            for block in response.content:
                if block.type == "tool_use" and block.name == "submit_grade":
                    if block.input.get("criterion_grades"):
                        return block.input
                    last_exc = ValueError("AI returned empty criterion_grades — no criteria were graded")
                    break
            else:
                last_exc = ValueError("Claude did not return a grade tool call")

        raise last_exc

    def extract_rubric(self, markdown: str) -> dict:
        """
        Use Anthropic Tool Use to extract a structured rubric from Markdown text.
        Returns a dict matching RubricSchema.
        Raises ValueError on failure.
        """
        rubric_tool = {
            "name": "submit_rubric",
            "description": (
                "Submit a fully structured grading rubric extracted from the provided document. "
                "Call this tool exactly once with the complete rubric."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The name or title of the rubric/assessment.",
                    },
                    "criteria": {
                        "type": "array",
                        "description": "List of grading criteria.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "string",
                                    "description": "Unique identifier (e.g. 'c1', 'c2').",
                                },
                                "name": {
                                    "type": "string",
                                    "description": "Name of this criterion.",
                                },
                                "weight_percentage": {
                                    "type": "number",
                                    "description": "Percentage weight of this criterion (0-100).",
                                },
                                "levels": {
                                    "type": "array",
                                    "description": "Performance levels for this criterion, from highest to lowest.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": {
                                                "type": "string",
                                                "description": "Unique level identifier (e.g. 'c1l1').",
                                            },
                                            "title": {
                                                "type": "string",
                                                "description": "Level label (e.g. 'Excellent', 'Pass').",
                                            },
                                            "points": {
                                                "type": "number",
                                                "description": "Points awarded for this level.",
                                            },
                                            "description": {
                                                "type": "string",
                                                "description": "What a student must demonstrate to achieve this level.",
                                            },
                                        },
                                        "required": ["id", "title", "points", "description"],
                                    },
                                },
                            },
                            "required": ["id", "name", "weight_percentage", "levels"],
                        },
                    },
                },
                "required": ["title", "criteria"],
            },
        }

        response = self._client.messages.create(
            model=self._resolve_model("sonnet"),
            max_tokens=4096,
            tools=[rubric_tool],
            tool_choice={"type": "tool", "name": "submit_rubric"},
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Extract a structured grading rubric from the following document. "
                        "Identify all criteria, their weights, and performance levels with point values.\n\n"
                        f"---\n{markdown}\n---"
                    ),
                }
            ],
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == "submit_rubric":
                return block.input

        raise ValueError("Claude did not return a rubric tool call")

    def format_rubric_to_markdown(self, rubric: dict) -> str:
        """
        Deterministic Markdown formatter for a rubric dict.
        Criteria sorted by name, levels sorted by points descending.
        Produces consistent output suitable as a static prompt-caching prefix.
        """
        lines = [f"# {rubric['title']}", "", "## Criteria", ""]
        sorted_criteria = sorted(rubric["criteria"], key=lambda c: c["name"])
        for criterion in sorted_criteria:
            lines.append(f"### {criterion['name']} ({criterion['weight_percentage']}%) [criterion_id: {criterion['id']}]")
            lines.append("| level_id | Level | Points | Description |")
            lines.append("|----------|-------|--------|-------------|")
            sorted_levels = sorted(criterion["levels"], key=lambda l: l["points"], reverse=True)
            for level in sorted_levels:
                lines.append(f"| {level['id']} | {level['title']} | {level['points']} | {level['description']} |")
            lines.append("")
            if (criterion.get("ai_hint") or "").strip():
                lines.append(f"> **Grading note (not visible to students):** {criterion['ai_hint'].strip()}")
                lines.append("")
        return "\n".join(lines)


ai_service = AIService()
