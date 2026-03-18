"""
Email service — builds plain-text grade result emails for mailto: links.
"""


def build_grade_text(
    assignment_name: str,
    student_name: str,
    student_id: str,
    result_type: str,
    criterion_grades: list,
    overall_feedback: str | None,
    rubric: dict | None,
    teacher_criterion_grades: list | None = None,
    teacher_overall_feedback: str | None = None,
) -> str:
    """Return a plain-text email body suitable for use in a mailto: URI."""

    # --- totals ---
    total_pts = sum(g.get("points_awarded", 0) for g in criterion_grades)

    max_pts = 0.0
    if rubric and rubric.get("criteria"):
        for c in rubric["criteria"]:
            levels = c.get("levels", [])
            if levels:
                max_pts += max((lv.get("points", 0) for lv in levels), default=0)

    pct = round(total_pts / max_pts * 100) if max_pts > 0 else 0
    result_label = "Resource" if result_type == "resource" else "Moderation"

    student_line = student_name or student_id
    if student_name and student_id and student_name != student_id:
        student_line = f"{student_name} ({student_id})"

    lines = [
        f"AI GRADE RESULTS \u2014 {assignment_name.upper()}",
        "",
        "",
        f"Student:      {student_line}",
        f"Type:         {result_label}",
        f"Total Score:  {total_pts:.1f} / {max_pts:.1f} pts  ({pct}%)",
        "",
        "",
        "CRITERION BREAKDOWN",
        "",
    ]

    # Build grade lookup by criterion_id and criterion_name
    grade_map: dict = {}
    for g in criterion_grades:
        if g.get("criterion_id"):
            grade_map[g["criterion_id"]] = g
        if g.get("criterion_name"):
            grade_map[g["criterion_name"]] = g

    criteria = (rubric or {}).get("criteria", [])
    if criteria:
        for c in criteria:
            grade = grade_map.get(c["id"]) or grade_map.get(c["name"], {})
            name = c.get("name", "")
            weight = c.get("weight_percentage", "")
            level_title = grade.get("level_title", "")
            pts_awarded = grade.get("points_awarded", "")

            c_levels = c.get("levels", [])
            c_max = max((lv.get("points", 0) for lv in c_levels), default=0) if c_levels else None

            header = name.upper()
            if weight != "":
                header += f"  ({weight}%)"

            grade_line = ""
            if level_title:
                score_str = f"{pts_awarded} / {c_max} pts" if c_max is not None and pts_awarded != "" else ""
                grade_line = level_title
                if score_str:
                    grade_line += f"  \u00b7  {score_str}"

            lines.append(header)
            if grade_line:
                lines.append(grade_line)

            feedback = grade.get("feedback", "")
            if feedback and feedback.strip():
                lines.append("")
                lines.append(feedback.strip())
            lines.append("")
            lines.append("")
    else:
        # Fallback: render straight from criterion_grades
        for g in criterion_grades:
            name = g.get("criterion_name", "Criterion")
            level_title = g.get("level_title", "")
            pts = g.get("points_awarded", 0)
            feedback = g.get("feedback", "")

            lines.append(name.upper())
            if level_title:
                lines.append(f"{level_title}  \u00b7  {pts} pts")

            if feedback and feedback.strip():
                lines.append("")
                lines.append(feedback.strip())
            lines.append("")
            lines.append("")

    if overall_feedback and overall_feedback.strip():
        lines.append("OVERALL FEEDBACK")
        lines.append("")
        lines.append(overall_feedback.strip())
        lines.append("")
        lines.append("")

    # Teacher grades section — only if teacher has graded
    if teacher_criterion_grades:
        teacher_total = sum(g.get("points_awarded", 0) for g in teacher_criterion_grades)
        lines.append("TEACHER GRADE")
        lines.append(f"Total Score:  {teacher_total:.1f} / {max_pts:.1f} pts")
        lines.append("")

        for g in teacher_criterion_grades:
            name = g.get("criterion_name", "")
            level_title = g.get("level_title", "")
            pts = g.get("points_awarded", "")
            feedback = g.get("feedback", "")

            header = name.upper()
            if level_title:
                header += f"  \u2014  {level_title}  \u00b7  {pts} pts"
            lines.append(header)

            if feedback and feedback.strip():
                lines.append("")
                lines.append(feedback.strip())
            lines.append("")

        if teacher_overall_feedback and teacher_overall_feedback.strip():
            lines.append("OVERALL FEEDBACK (TEACHER)")
            lines.append("")
            lines.append(teacher_overall_feedback.strip())
            lines.append("")

        lines.append("")

    lines.append("\u2014")
    lines.append(
        "This grade was generated by AI and may be subject to review by your "
        "instructor. If you have questions, please contact your course coordinator."
    )

    return "\n".join(lines)
