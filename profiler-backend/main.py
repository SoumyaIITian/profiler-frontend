import json
import os
import random
import time
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any
import google.generativeai as genai
from dotenv import load_dotenv

# --- 1. Initial Setup ---

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("CRITICAL ERROR: GEMINI_API_KEY not found in .env file.")
else:
    genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI(
    title="Cognitive Profiler Backend",
    description="The secure 'brain' for the React Cognitive Profiler app."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. Load Data ---

try:
    with open("questions.json", "r") as f:
        QUESTION_BANK = json.load(f)
except Exception as e:
    print(f"CRITICAL ERROR: Could not load questions.json: {e}")
    QUESTION_BANK = []

CATEGORY_METADATA = {
    "Verbal Logic": {"id": "verbal-logic", "description": "Reasoning with language and words.", "icon": "message-circle"},
    "Pattern Recognition": {"id": "pattern-recognition", "description": "Identifying sequences and connections.", "icon": "grid-3x3"},
    "Spatial Reasoning": {"id": "spatial-reasoning", "description": "Visualizing and manipulating shapes.", "icon": "box"},
    "Memory": {"id": "memory", "description": "Recalling information accurately.", "icon": "brain"},
    "Numerical Reasoning": {"id": "numerical-reasoning", "description": "Solving problems with numbers.", "icon": "calculator"},
    "Attention to Detail": {"id": "attention-to-detail", "description": "Focusing on the small particulars.", "icon": "search"}
}

ID_TO_TITLE_MAP = {
    meta["id"]: title
    for title, meta in CATEGORY_METADATA.items()
}

try:
    ANSWER_KEY = {q["id"]: q["correctAnswerIndex"] for q in QUESTION_BANK}
    CATEGORY_KEY = {q["id"]: q["category"] for q in QUESTION_BANK}
except KeyError as e:
    print(f"ERROR in questions.json: A question is missing 'id' or 'correctAnswerIndex': {e}")
    ANSWER_KEY = {}
    CATEGORY_KEY = {}

# --- 3. Pydantic Models (Our Data "Contracts") ---

class Category(BaseModel):
    id: str
    title: str
    description: str
    icon: str

class StartTestRequest(BaseModel):
    categories: List[str] = Field(..., min_length=1)

class QuestionResponse(BaseModel):
    id: int
    category: str
    questionText: str
    options: List[str]

class QuizResponse(BaseModel):
    questions: List[QuestionResponse]
    timeLimitSeconds: int

class Answer(BaseModel):
    questionId: int
    selectedOption: int

class SubmitTestRequest(BaseModel):
    answers: List[Answer]

class CategoryScoreInput(BaseModel):
    category: str
    score: str

class AIAnalysisRequest(BaseModel):
    overall_score: str
    category_scores: List[CategoryScoreInput]

class AIAnalysisResponse(BaseModel):
    title: str
    overall_summary: str
    strengths_analysis: str
    growth_analysis: str
    action_item: str

# --- NEW: Models to send back the combined results ---

class CategoryResult(BaseModel):
    correct: int
    total: int

class TestResults(BaseModel):
    totalCorrect: int
    totalQuestions: int
    categoryResults: Dict[str, CategoryResult]

class SubmitResponse(BaseModel):
    results: TestResults
    analysis: AIAnalysisResponse

# --- END OF NEW MODELS ---

AI_SYSTEM_PROMPT = """
You are an expert cognitive skills coach and analyst. Your tone is professional, 
encouraging, insightful, and positive. You are NOT a doctor and you MUST NOT 
provide any medical diagnosis or advice.

You will be given a JSON object containing a user's performance on a cognitive 
skills quiz. The user is looking for an analysis of their strengths and 
potential areas for practice.

Your task is to analyze their performance and return a single, valid JSON object 
containing your analysis.

The output JSON object MUST have this exact structure:
{
  "title": "Your Profile Analysis",
  "overall_summary": "A 2-3 sentence overview of their performance.",
  "strengths_analysis": "A detailed paragraph identifying their strongest-performing 
                         category and explaining what that skill means.encouraging by mentioninging their score",
  "growth_analysis": "A friendly and encouraging paragraph identifying their 
                      lowest-performing category, framing it as an 'area for practice' 
                      or 'a new challenge to explore'.",
  "action_item": "A single, simple, real-world action item the user can do 
                  to practice their growth area (e.g., 'Try a Sudoku puzzle' or 
                  'Read a new article and try to summarize it')."
}
"""


model = genai.GenerativeModel(
    model_name='gemini-2.5-flash-preview-09-2025',
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json"
    )
)

# --- 4. API Endpoints ---

@app.get("/categories", response_model=List[Category])
async def get_categories():
    categories = [
        Category(
            id=meta["id"],
            title=title,
            description=meta["description"],
            icon=meta["icon"]
        )
        for title, meta in CATEGORY_METADATA.items()
        if title in {q["category"] for q in QUESTION_BANK}
    ]
    return categories

@app.post("/start-test", response_model=QuizResponse)
async def start_test(request: StartTestRequest):
    selected_ids = request.categories
    num_categories = len(selected_ids)

    if num_categories == 1:
        TOTAL_QUESTIONS = 15
        time_limit_seconds = 900
    else:
        TOTAL_QUESTIONS = 30
        time_limit_seconds = 30 * 60

    try:
        selected_titles = [ID_TO_TITLE_MAP[id] for id in selected_ids]
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Invalid category ID: {e}")

    questions_per_category = TOTAL_QUESTIONS // num_categories
    remainder = TOTAL_QUESTIONS % num_categories

    final_quiz_list = []
    
    for i, title in enumerate(selected_titles):
        num_to_pick = questions_per_category
        if i < remainder:
            num_to_pick += 1
        
        category_pool = [q for q in QUESTION_BANK if q["category"] == title]
        num_available = len(category_pool)
        actual_num_to_pick = min(num_to_pick, num_available)
        
        selected_questions = random.sample(category_pool, actual_num_to_pick)
        final_quiz_list.extend(selected_questions)

    random.shuffle(final_quiz_list)

    formatted_quiz_list = [QuestionResponse(**q) for q in final_quiz_list]

    return QuizResponse(
        questions=formatted_quiz_list,
        timeLimitSeconds=time_limit_seconds
    )

# --- UPDATED SUBMIT_TEST ---
@app.post("/submit-test", response_model=SubmitResponse)
async def submit_test(request: SubmitTestRequest):
    if not ANSWER_KEY or not CATEGORY_KEY:
        raise HTTPException(status_code=500, detail="Server error: Answer key not loaded.")

    # --- 1. The "Grader" ---
    total_correct = 0
    total_questions = len(request.answers)
    category_scores_dict: Dict[str, Dict[str, int]] = {} 

    for answer in request.answers:
        q_id = answer.questionId
        if q_id not in ANSWER_KEY or q_id not in CATEGORY_KEY:
            continue 

        category = CATEGORY_KEY[q_id]
        correct_answer_index = ANSWER_KEY[q_id]

        if category not in category_scores_dict:
            category_scores_dict[category] = {"correct": 0, "total": 0}
        
        category_scores_dict[category]["total"] += 1
        
        is_correct = (answer.selectedOption == correct_answer_index)
        if is_correct:
            total_correct += 1
            category_scores_dict[category]["correct"] += 1

    if total_questions == 0:
        raise HTTPException(status_code=400, detail="No answers provided.")
    
    # --- Create the Pydantic-compatible TestResults object ---
    results = TestResults(
        totalCorrect=total_correct,
        totalQuestions=total_questions,
        categoryResults={
            cat_name: CategoryResult(**scores)
            for cat_name, scores in category_scores_dict.items()
        }
    )

    # --- 2. The "AI Analyst" ---
    ai_request_data = AIAnalysisRequest(
        overall_score=f"{total_correct}/{total_questions}",
        category_scores=[
            CategoryScoreInput(
                category=cat_name,
                score=f"{scores['correct']}/{scores['total']}"
            ) for cat_name, scores in category_scores_dict.items() if scores['total'] > 0
        ]
    )

    # --- 3. Call Gemini API ---
    try:
        response = model.generate_content(
            [AI_SYSTEM_PROMPT, ai_request_data.model_dump_json()]
        )
        result_json = json.loads(response.text)
        final_analysis = AIAnalysisResponse(**result_json)
        
        # --- 4. Return the COMBINED object ---
        return SubmitResponse(
            results=results,
            analysis=final_analysis
        )
    
    except Exception as e:
        print(f"Gemini API call failed: {e}")
        raise HTTPException(
            status_code=500, 
            detail="The AI analysis service is currently unavailable. Please try again later."
        )

# This allows running the app with `python main.py`
if __name__ == "__main__":
    import uvicorn
    print("Starting FastAPI server on http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)