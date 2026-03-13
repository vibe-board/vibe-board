import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { AskUserQuestionItem, QuestionAnswer } from 'shared/types';
import { QuestionIcon } from '@phosphor-icons/react';

export interface AskUserQuestionBannerHandle {
  submitCustomAnswer: (text: string) => void;
}

interface AskUserQuestionBannerProps {
  questions: AskUserQuestionItem[];
  onSubmitAnswers: (answers: QuestionAnswer[]) => void;
  isSubmitting: boolean;
  isTimedOut: boolean;
  error: string | null;
}

export const AskUserQuestionBanner = forwardRef<
  AskUserQuestionBannerHandle,
  AskUserQuestionBannerProps
>(function AskUserQuestionBanner(
  { questions, onSubmitAnswers, isSubmitting, isTimedOut, error },
  ref
) {
  const { t } = useTranslation('common');
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [customInput, setCustomInput] = useState('');

  const toQuestionAnswers = useCallback(
    (rec: Record<string, string[]>): QuestionAnswer[] =>
      questions
        .filter((q) => rec[q.question] !== undefined)
        .map((q) => ({ question: q.question, answer: rec[q.question] })),
    [questions]
  );
  const currentIndex = useMemo(() => {
    for (let i = 0; i < questions.length; i++) {
      if (answers[questions[i].question] === undefined) return i;
    }
    return questions.length;
  }, [questions, answers]);

  const [multiSelectLabels, setMultiSelectLabels] = useState<Set<string>>(
    new Set()
  );

  const currentQuestion =
    currentIndex < questions.length ? questions[currentIndex] : null;
  const isAllAnswered = currentIndex >= questions.length;
  const disabled = isSubmitting || isTimedOut;

  const handleSelectOption = useCallback(
    (label: string) => {
      if (disabled || !currentQuestion) return;

      if (currentQuestion.multiSelect) {
        setMultiSelectLabels((prev) => {
          const next = new Set(prev);
          if (next.has(label)) {
            next.delete(label);
          } else {
            next.add(label);
          }
          return next;
        });
      } else {
        const newAnswers = {
          ...answers,
          [currentQuestion.question]: [label],
        };
        setAnswers(newAnswers);

        if (currentIndex === questions.length - 1) {
          onSubmitAnswers(toQuestionAnswers(newAnswers));
        }
      }
    },
    [
      disabled,
      currentQuestion,
      answers,
      currentIndex,
      questions.length,
      onSubmitAnswers,
      toQuestionAnswers,
    ]
  );

  const handleConfirmMultiSelect = useCallback(() => {
    if (disabled || !currentQuestion) return;

    const labels = Array.from(multiSelectLabels);
    if (labels.length === 0) return;

    const newAnswers = {
      ...answers,
      [currentQuestion.question]: labels,
    };
    setAnswers(newAnswers);
    setMultiSelectLabels(new Set());

    if (currentIndex === questions.length - 1) {
      onSubmitAnswers(toQuestionAnswers(newAnswers));
    }
  }, [
    disabled,
    currentQuestion,
    multiSelectLabels,
    answers,
    currentIndex,
    questions.length,
    onSubmitAnswers,
    toQuestionAnswers,
  ]);

  const handleSubmitCustomInput = useCallback(() => {
    if (disabled || !currentQuestion || !customInput.trim()) return;

    const newAnswers = {
      ...answers,
      [currentQuestion.question]: [customInput.trim()],
    };
    setAnswers(newAnswers);
    setCustomInput('');

    if (currentIndex === questions.length - 1) {
      onSubmitAnswers(toQuestionAnswers(newAnswers));
    }
  }, [
    disabled,
    currentQuestion,
    customInput,
    answers,
    currentIndex,
    questions.length,
    onSubmitAnswers,
    toQuestionAnswers,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      submitCustomAnswer: (text: string) => {
        if (disabled || !currentQuestion || !text.trim()) return;
        const newAnswers = {
          ...answers,
          [currentQuestion.question]: [text.trim()],
        };
        setAnswers(newAnswers);
        if (currentIndex === questions.length - 1) {
          onSubmitAnswers(toQuestionAnswers(newAnswers));
        }
      },
    }),
    [
      disabled,
      currentQuestion,
      answers,
      currentIndex,
      questions.length,
      onSubmitAnswers,
      toQuestionAnswers,
    ]
  );

  if (isAllAnswered && !isSubmitting) return null;

  return (
    <div className="border-b">
      <div className="flex items-center gap-base px-double py-base">
        <QuestionIcon className="h-4 w-4 text-brand flex-shrink-0" />
        <span className="text-sm text-normal flex-1">
          {t('askQuestion.title')}
          {questions.length > 1 && (
            <span className="text-low ml-1">
              ({Math.min(currentIndex + 1, questions.length)}/{questions.length}
              )
            </span>
          )}
        </span>
      </div>

      {currentQuestion && (
        <div className="px-double pb-base">
          <div className="flex items-center gap-base mb-base">
            <span className="text-xs font-medium text-low bg-secondary px-1 py-0.5 rounded">
              {currentQuestion.header}
            </span>
            {currentQuestion.multiSelect && (
              <span className="text-xs text-low">
                {t('askQuestion.selectMultiple')}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-normal mb-base">
            {currentQuestion.question}
          </p>
          {currentQuestion.options.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-base">
                {currentQuestion.options.map((opt) => {
                  const isSelected =
                    currentQuestion.multiSelect && multiSelectLabels.has(opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelectOption(opt.label)}
                      className={`
                        group relative rounded-md border px-2.5 py-1.5 text-xs transition-all
                        ${
                          isSelected
                            ? 'border-brand bg-brand/10 text-normal'
                            : 'border-border text-low hover:border-brand/40 hover:text-normal hover:bg-accent'
                        }
                        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                      title={opt.description}
                    >
                      <span className="font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {currentQuestion.multiSelect && multiSelectLabels.size > 0 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleConfirmMultiSelect}
                  className="mt-2 rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
                >
                  {t('askQuestion.confirmSelection')}
                </button>
              )}
            </>
          ) : (
            // Text input fallback when no predefined options are provided
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customInput.trim()) {
                    handleSubmitCustomInput();
                  }
                }}
                disabled={disabled}
                placeholder="Type your answer..."
                className="flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-secondary text-normal placeholder:text-low focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                disabled={disabled || !customInput.trim()}
                onClick={handleSubmitCustomInput}
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {t('askQuestion.submit', 'Submit')}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="px-double pb-base text-sm text-error">{error}</div>
      )}

      {isSubmitting && (
        <div className="px-double pb-base text-sm text-low">
          {t('askQuestion.submitting')}
        </div>
      )}
    </div>
  );
});
