"""
Stub for the RiPPLE platform API integration.
Fill this in once API credentials and documentation are available.
"""


class RippleService:
    def get_submissions(self, assessment_id: str) -> list:
        """Fetch all student submissions for an assessment from RiPPLE."""
        raise NotImplementedError

    def get_moderation_report(self, assessment_id: str) -> dict:
        """Fetch the moderation report for an assessment from RiPPLE."""
        raise NotImplementedError


ripple_service = RippleService()
