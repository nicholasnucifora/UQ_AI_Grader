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


def _apply_grade_scale_numeric(raw_score: float, max_possible: float, scale: dict | None) -> tuple[float, float] | None:
    """Return (scaled_value, scale_max) as floats, or None if scaling is off."""
    if not scale or not scale.get("enabled") or not scale.get("max") or max_possible <= 0:
        return None
    scale_max = float(scale["max"])
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
    else:
        scaled = round(scaled, dp)
    return scaled, scale_max


def _compute_item_totals(item: dict) -> tuple[float, float]:
    """Return (total_pts, max_pts) for a result item."""
    criterion_grades = item.get("criterion_grades", [])
    rubric = item.get("rubric")
    total_pts = sum(g.get("points_awarded", 0) for g in criterion_grades)
    max_pts = 0.0
    if rubric and rubric.get("criteria"):
        for c in rubric["criteria"]:
            lvs = c.get("levels", [])
            if lvs:
                max_pts += max((lv.get("points", 0) for lv in lvs), default=0)
    return total_pts, max_pts


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
    if result_type == "moderation":
        moderation_id = item.get("moderation_id") or resource_id
        label_str = f"Moderation {moderation_id} of Resource {resource_id}"
    else:
        label_str = f"Resource {resource_id}"
    lines.append(f"\u2500\u2500 {label_str} \u2500\u2500")
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


def _compute_combined_stats(
    items: list[dict],
    max_n: int | None,
    grade_scale: dict | None,
) -> dict | None:
    """Compute combined (possibly penalised) grade stats for a list of graded items.

    Returns a dict with keys: combined_raw, max_per, scaled, submitted, required, missing.
    Returns None if no items or no max_points.
    """
    if not items:
        return None
    pairs = [_compute_item_totals(i) for i in items]
    scores = [pts for pts, _ in pairs]
    maxes = [mx for _, mx in pairs]
    max_per = max(maxes) if maxes else 0.0
    if max_per <= 0:
        return None

    submitted = len(scores)
    sorted_desc = sorted(scores, reverse=True)

    if max_n and max_n > 0:
        denom = max_n
        best = sorted_desc[:denom]
        combined_raw = sum(best) / denom
        missing = max(0, max_n - submitted)
    else:
        denom = submitted
        combined_raw = sum(sorted_desc) / denom if denom else 0.0
        missing = 0

    scaled = _apply_grade_scale(combined_raw, max_per, grade_scale)
    numeric = _apply_grade_scale_numeric(combined_raw, max_per, grade_scale)
    return {
        "combined_raw": combined_raw,
        "max_per": max_per,
        "scaled": scaled,
        "scaled_value": numeric[0] if numeric else None,
        "scale_max": numeric[1] if numeric else None,
        "submitted": submitted,
        "required": max_n,
        "missing": missing,
    }


def _type_summary_lines(
    label: str,
    items: list[dict],
    combine: bool,
    max_n: int | None,
    scale: dict | None,
) -> list[str]:
    """
    Build the summary block for one result type (Resources or Moderations).

    When combine=True:  shows overall grade, required/submitted note, and a
                        list of all individual submission grades (sorted highest
                        first).  No markers — the note explains what was used.
    When combine=False: shows a single raw-score line.
    """
    if not items:
        return []

    scored: list[tuple[dict, float, float]] = sorted(
        [(item, _compute_item_totals(item)[0], _compute_item_totals(item)[1]) for item in items],
        key=lambda x: x[1],
        reverse=True,
    )

    if not combine:
        total_pts = sum(s for _, s, _ in scored)
        total_max = sum(m for _, _, m in scored)
        if total_max <= 0:
            return []
        pct = round(total_pts / total_max * 100)
        scaled = _apply_grade_scale(total_pts, total_max, scale)
        line = f"{label}:  {total_pts:.1f} / {total_max:.1f} pts  ({pct}%)"
        if scaled:
            line += f"  \u2192  Grade: {scaled}"
        return [line]

    # --- combine=True ---
    stats = _compute_combined_stats(items, max_n, scale)
    if not stats:
        return []

    grade_str = stats["scaled"] or f"{stats['combined_raw']:.2f} / {stats['max_per']:.1f} pts"
    req = stats["required"]
    sub = stats["submitted"]
    missing = stats["missing"]

    out: list[str] = [f"{label}  \u2014  Overall Grade:  {grade_str}"]

    if req:
        note = f"  {req} required \u2014 {sub} submitted"
        if missing > 0:
            note += f", {missing} missing (counted as 0)"
        elif sub > req:
            note += f" (best {req} used)"
        out.append(note)
    else:
        out.append(f"  average of {sub} submission{'s' if sub != 1 else ''}")

    for item, pts, max_pts in scored:
        ind_grade = _apply_grade_scale(pts, max_pts, scale) or f"{pts:.1f} / {max_pts:.1f} pts"
        res_id = item.get("resource_id", "")
        if label == "Moderations":
            mod_id = item.get("moderation_id") or res_id
            item_label = f"Moderation {mod_id}"
        else:
            item_label = f"Resource {res_id}"
        out.append(f"  {item_label}:  {ind_grade}")

    if missing > 0:
        scale_max = stats.get("scale_max")
        max_per = stats["max_per"]
        zero_grade = f"0 / {scale_max:.4g}" if scale_max else f"0 / {max_per:.1f} pts"
        for _ in range(missing):
            out.append(f"  [not submitted]:  {zero_grade}")

    return out


def _topic_combined_grade_str(
    res_items: list[dict],
    mod_items: list[dict],
    is_rnm: bool,
    combine_resource_grades: bool,
    combine_resource_max_n: int | None,
    res_scale: dict | None,
    combine_moderation_grades: bool,
    combine_moderation_max_n: int | None,
    mod_scale: dict | None,
) -> str | None:
    """Return a single-line grade string for one topic, or None if not applicable."""
    parts: list[tuple[float, float]] = []  # (value, max)

    if combine_resource_grades and res_items:
        rs = _compute_combined_stats(res_items, combine_resource_max_n, res_scale)
        if rs:
            val = rs["scaled_value"] if rs["scaled_value"] is not None else rs["combined_raw"]
            mx = rs["scale_max"] if rs["scale_max"] is not None else rs["max_per"]
            parts.append((val, mx))

    if is_rnm and combine_moderation_grades and mod_items:
        ms = _compute_combined_stats(mod_items, combine_moderation_max_n, mod_scale)
        if ms:
            val = ms["scaled_value"] if ms["scaled_value"] is not None else ms["combined_raw"]
            mx = ms["scale_max"] if ms["scale_max"] is not None else ms["max_per"]
            parts.append((val, mx))

    if not parts:
        # Fall back to raw pts
        all_items = res_items + mod_items
        total_pts = sum(_compute_item_totals(i)[0] for i in all_items)
        total_max = sum(_compute_item_totals(i)[1] for i in all_items)
        if total_max <= 0:
            return None
        pct = round(total_pts / total_max * 100)
        return f"{total_pts:.1f} / {total_max:.1f} pts  ({pct}%)"

    total_val = sum(v for v, _ in parts)
    total_max = sum(m for _, m in parts)
    return f"{total_val:.2f} / {total_max:.2f}"


def build_student_summary_text(
    assignment_name: str,
    student_name: str,
    student_id: str,
    results_by_topic: list,
    assignment_type: str = "resources",
    combine_resource_grades: bool = False,
    combine_resource_max_n: int | None = None,
    combine_moderation_grades: bool = False,
    combine_moderation_max_n: int | None = None,
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

    # Collect scale settings from the first item of each type
    res_scale: dict | None = None
    mod_scale: dict | None = None
    for group in results_by_topic:
        for item in group.get("resources", []):
            if res_scale is None:
                res_scale = item.get("grade_scale")
        for item in group.get("moderations", []):
            if mod_scale is None:
                mod_scale = item.get("grade_scale")

    is_rnm = assignment_type == "resources_and_moderations"

    thin_sep = "\u2500" * 40   # ────────────────────────────────────────
    wide_sep = "\u2550" * 48   # ════════════════════════════════════════

    lines: list[str] = [
        f"AI GRADE RESULTS \u2014 {assignment_name.upper()}",
        "",
        "",
        f"Student:  {student_line}",
        "",
    ]

    # ── Per-topic combined grade overview ──────────────────────────────────
    if results_by_topic:
        lines.append("COMBINED GRADES:")
        for group in results_by_topic:
            topic = group["topic"]
            grade_str = _topic_combined_grade_str(
                group.get("resources", []), group.get("moderations", []),
                is_rnm,
                combine_resource_grades, combine_resource_max_n, res_scale,
                combine_moderation_grades, combine_moderation_max_n, mod_scale,
            )
            if grade_str:
                lines.append(f"  {topic}:  {grade_str}")
        lines.append("")

    # ── Per-topic stats (overall grade + submission list) ──────────────────
    for group in results_by_topic:
        topic = group["topic"]
        res_items = group.get("resources", [])
        mod_items = group.get("moderations", [])

        lines.extend(["", thin_sep, topic, thin_sep, ""])

        if res_items:
            lines.extend(_type_summary_lines(
                "Resources", res_items,
                combine_resource_grades, combine_resource_max_n, res_scale,
            ))
            lines.append("")

        if mod_items:
            lines.extend(_type_summary_lines(
                "Moderations", mod_items,
                combine_moderation_grades, combine_moderation_max_n, mod_scale,
            ))
            lines.append("")

    # ── Separator before detailed AI feedback ─────────────────────────────
    lines.extend([
        "",
        wide_sep,
        "The detailed AI feedback for each of your submissions is below.",
        "Read on if you want specifics on how each criterion was assessed.",
        wide_sep,
        "",
    ])

    # ── Per-topic detailed criterion feedback ─────────────────────────────
    for group in results_by_topic:
        topic = group["topic"]
        lines.extend([thin_sep, f"TOPIC: {topic}", thin_sep, ""])
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
