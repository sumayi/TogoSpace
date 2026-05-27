from service.llmService.llmRequestRules import apply_llm_request_rules
from util import llmApiUtil


def test_apply_llm_request_rules_strips_required_tool_choice_for_reasoning():
    request = llmApiUtil.OpenAIRequest(
        model="deepseek-v4-pro",
        messages=[llmApiUtil.OpenAIMessage.text(llmApiUtil.OpenaiApiRole.USER, "hello")],
        tool_choice="required",
        provider_params={"reasoning_effort": "high"},
    )

    next_request, applied_rules = apply_llm_request_rules(request)

    assert next_request.tool_choice is None
    assert applied_rules == ("StripRequiredToolChoiceForReasoningRule",)


def test_apply_llm_request_rules_keeps_non_required_tool_choice():
    request = llmApiUtil.OpenAIRequest(
        model="deepseek-v4-pro",
        messages=[llmApiUtil.OpenAIMessage.text(llmApiUtil.OpenaiApiRole.USER, "hello")],
        tool_choice="none",
        provider_params={"reasoning_effort": "high"},
    )

    next_request, applied_rules = apply_llm_request_rules(request)

    assert next_request.tool_choice == "none"
    assert applied_rules == ()
