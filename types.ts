
import React from 'react';

export interface Analysis {
  title: string;
  overall_summary: string;
  strengths_analysis: string;
  growth_analysis: string;
  action_item: string;
}

export interface Category {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface Question {
  id: number;
  category: string;
  questionText: string;
  options: string[];
}

export interface UserAnswer {
  [questionId: string]: number;
}

export interface CategoryResult {
  correct: number;
  total: number;
}

export interface TestResults {
  totalCorrect: number;
  totalQuestions: number;
  categoryResults: {
    [categoryName: string]: CategoryResult;
  };
}
export interface SubmitResponse {
  results: TestResults;
  analysis: Analysis;
}