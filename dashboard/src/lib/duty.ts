import type { DutyAssessmentGrade } from '../types';

export const DUTY_GRADE_ORDER: DutyAssessmentGrade[] = ['excellent', 'good', 'satisfactory', 'unsatisfactory'];

export const DUTY_GRADE_META: Record<DutyAssessmentGrade, {
  label: string;
  shortLabel: string;
  score: number;
  color: string;
  surface: string;
  border: string;
  solid: string;
}> = {
  excellent: {
    label: 'Отлично',
    shortLabel: 'Отлично',
    score: 4,
    color: '#c7a6ff',
    surface: 'rgba(82, 54, 124, 0.28)',
    border: 'rgba(199, 166, 255, 0.34)',
    solid: '#8258d6',
  },
  good: {
    label: 'Хорошо',
    shortLabel: 'Хорошо',
    score: 3,
    color: '#91d9b3',
    surface: 'rgba(42, 92, 66, 0.26)',
    border: 'rgba(145, 217, 179, 0.32)',
    solid: '#3fa96a',
  },
  satisfactory: {
    label: 'Удовлетворительно',
    shortLabel: 'Удовл.',
    score: 2,
    color: '#ffb869',
    surface: 'rgba(121, 78, 31, 0.26)',
    border: 'rgba(255, 184, 105, 0.34)',
    solid: '#d88a38',
  },
  unsatisfactory: {
    label: 'Неудовлетворительно',
    shortLabel: 'Плохо',
    score: 1,
    color: '#ff8d82',
    surface: 'rgba(121, 43, 43, 0.26)',
    border: 'rgba(255, 141, 130, 0.34)',
    solid: '#c85a50',
  },
};

export function getDutyGradeMeta(grade: DutyAssessmentGrade) {
  return DUTY_GRADE_META[grade];
}