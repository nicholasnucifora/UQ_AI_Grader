"""
Email service — builds plain-text grade result emails for mailto: links.
"""

import math


def _apply_grade_scale(raw_score: float, max_possible: float, scale: dict | None) -> str | None:
    """Return a formatted scaled grade string (e.g. '3.0 / 4'), or None if scaling is off."""
    if not scale or not scale.get("enabled") or not scale.get("max") or max_possible <= 0:
        return None
    scale_max = scale["max"]
    rounding = scale.get("rounding", "none")
    dp = int(scale.get("decimal_places", 2))
    scaled = (raw_score / max_possible) * scale_max
    if rounding == "round":
        f = 10 ** dp
        scaled = round(scaled * f) / f
    elif rounding == "round_up":
        f = 10 ** dp
        scaled = math.ceil(scaled * f) / f
    elif rounding == "round_down":
        f = 10 ** dp
        scaled = math.floor(scaled * f) / f
    elif rounding == "half":
        scaled = round(scaled * 2) / 2
        dp = 1
    else:
        scaled = round(scaled, dp)
    return f"{scaled:.{dp}f} / {scale_max}"


def _append_result_lines(lines: list, item: dict) -> None:
    """Append formatted lines for a single result (resource or moderation) to `lines`."""
    result_type = item["result_type"]
    resource_id = item["resource_id"]
    criterion_grades = item["criterion_grades"]
    overall_feedback = item.get("overall_feedback")
    teacher_criterion_grades = item.get("teacher_criterion_grades")
    teacher_overall_feedback = item.get("teacher_overall_feedback")
    rubric = item.get("rubric")

    grade_scale = item.get("grade_scale")
    label = "Resource" if result_type == "resource" else "Moderation"
    lines.append(f"\u2500\u2500 {label} {resource_id} \u2500\u2500")
    lines.append("")

    total_pts = sum(g.get("points_awarded", 0) for g in criterion_grades)
    max_pts = 0.0
    if rubric and rubric.get("criteria"):
        for c in rubric["criteria"]:
            lvs = c.get("levels", [])
            if lvs:
                max_pts += max((lv.get("points", 0) for lv in lvs), default=0)
    pct = round(total_pts / max_pts * 100) if max_pts > 0 else 0

    lines.append(f"AI Score:  {total_pts:.1f} / {max_pts:.1f} pts  ({pct}%)")
    scaled = _apply_grade_scale(total_pts, max_pts, grade_scale)
    if scaled:
        lines.append(f"Grade Output:  {scaled}")
    lines.append("")

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
            lines.append(header)

            if level_title:
                score_str = f"{pts_awarded} / {c_max} pts" if c_max is not None and pts_awarded != "" else ""
                grade_line = level_title
                if score_str:
                    grade_line += f"  \u00b7  {score_str}"
                lines.append(grade_line)

            feedback = grade.get("feedback", "")
            if feedback and feedback.strip():
                lines.append("")
                lines.append(feedback.strip())
            lines.append("")
    else:
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

    if overall_feedback and overall_feedback.strip():
        lines.extend(["OVERALL AI FEEDBACK", "", overall_feedback.strip(), ""])

    if teacher_criterion_grades:
        teacher_total = sum(g.get("points_awarded", 0) for g in teacher_criterion_grades)
        teacher_scaled = _apply_grade_scale(teacher_total, max_pts, grade_scale)
        teacher_score_line = f"Total Score:  {teacher_total:.1f} / {max_pts:.1f} pts"
        if teacher_scaled:
            teacher_score_line += f"  \u2192  Grade Output: {teacher_scaled}"
        lines.extend(["TEACHER GRADE", teacher_score_line, ""])
        for g in teacher_criterion_grades:
            name = g.get("criterion_name", "")
            level_title = g.get("level_title", "")
            pts = g.get("points_awarded", "")
            feedback = g.get("feedback", "")
            h = name.upper()
            if level_title:
                h += f"  \u2014  {level_title}  \u00b7  {pts} pts"
            lines.append(h)
            if feedback and feedback.strip():
                lines.extend(["", feedback.strip()])
            lines.append("")
        if teacher_overall_feedback and teacher_overall_feedback.strip():
            lines.extend(["OVERALL FEEDBACK (TEACHER)", "", teacher_overall_feedback.strip(), ""])

    lines.append("")


def build_student_summary_text(
    assignment_name: str,
    student_name: str,
    student_id: str,
    results_by_topic: list,
) -> str:
    """Build a combined plain-text email for all of a student's grade results.

    `results_by_topic` is a list of dicts:
      [{"topic": str, "resources": [item], "moderations": [item]}]
    where each item has: result_type, resource_id, criterion_grades,
    overall_feedback, teacher_criterion_grades, teacher_overall_feedback, rubric.
    """
    student_line = student_name or student_id
    if student_name and student_id and student_name != student_id:
        student_line = f"{student_name} ({student_id})"

    lines = [
        f"AI GRADE RESULTS \u2014 {assignment_name.upper()}",
        "",
        "",
        f"Student:  {student_line}",
        "",
        "",
    ]

    sep = "\u2550" * 48  # ════...

    for group in results_by_topic:
        topic = group["topic"]
        lines.extend([sep, f"TOPIC: {topic}", sep, ""])
        for item in group["resources"]:
            _append_result_lines(lines, item)
        for item in group["moderations"]:
            _append_result_lines(lines, item)

    lines.extend([
        "\u2014",
        "This grade was generated by AI and may be subject to review by your "
        "instructor. If you have questions, please contact your course coordinator.",
    ])

    return "\n".join(lines)


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
    grade_scale: dict | None = None,
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

    scaled = _apply_grade_scale(total_pts, max_pts, grade_scale)
    header_lines = [
        f"AI GRADE RESULTS \u2014 {assignment_name.upper()}",
        "",
        "",
        f"Student:      {student_line}",
        f"Type:         {result_label}",
        f"Total Score:  {total_pts:.1f} / {max_pts:.1f} pts  ({pct}%)",
    ]
    if scaled:
        header_lines.append(f"Grade Output: {scaled}")
    header_lines += ["", "", "CRITERION BREAKDOWN", ""]
    lines = header_lines

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
        teacher_scaled = _apply_grade_scale(teacher_total, max_pts, grade_scale)
        lines.append("TEACHER GRADE")
        lines.append(f"Total Score:  {teacher_total:.1f} / {max_pts:.1f} pts")
        if teacher_scaled:
            lines.append(f"Grade Output: {teacher_scaled}")
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
