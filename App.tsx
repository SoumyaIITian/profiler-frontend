import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Analysis, Category, Question, UserAnswer, TestResults, SubmitResponse } from './types';
import { BrainIcon, SpeechBubbleIcon, PatternIcon, CubeIcon, CalculatorIcon, MagnifyingGlassIcon } from './components/icons.tsx';

type Screen = 'selection' | 'test' | 'loading' | 'results';
const API_BASE_URL = "https://profiler-backend-5plw.onrender.com";

const shuffleArray = <T,>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);

// FIX: Define a dedicated interface for CategoryCard props to resolve a TypeScript error where the 'key' prop was being incorrectly treated as a regular prop.
interface CategoryCardProps {
    category: Category;
    onSelect: (id: string) => void;
    isSelected: boolean;
}

const CategoryCard = ({ category, onSelect, isSelected }: CategoryCardProps) => {
    const iconMap: { [key: string]: React.ElementType } = {
    'message-circle': SpeechBubbleIcon,
    'grid-3x3': PatternIcon,
    'box': CubeIcon,
    'brain': BrainIcon,
    'calculator': CalculatorIcon,
    'search': MagnifyingGlassIcon,
    'default': CubeIcon // A fallback
    };
    const Icon = iconMap[category.icon] || iconMap['default'];
    return (
        <button
            onClick={() => onSelect(category.id)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-300 backdrop-blur-md ${
                isSelected 
                ? 'bg-primary/20 border-primary shadow-lg' 
                : 'bg-white/5 border-white/10 hover:border-primary/50 hover:bg-white/10'
            }`}
            aria-pressed={isSelected}
        >
            <div className="flex items-center space-x-4">
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${
                    isSelected 
                    ? 'bg-primary text-background' 
                    : 'bg-white/10 text-primary'
                }`}>
                    <Icon className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="font-semibold text-text-primary">{category.title}</h3>
                    <p className="text-sm text-text-secondary">{category.description}</p>
                </div>
            </div>
        </button>
    );
};

const CategorySelectionScreen = ({ categories, onStartTest }: { categories: Category[], onStartTest: (categories: Category[]) => void }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const handleSelect = (id: string) => {
        const newSelected = new Set(selected);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelected(newSelected);
    };

    const handleStart = () => {
        const selectedCategories = categories.filter(cat => selected.has(cat.id));
        onStartTest(selectedCategories);
    };

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6">
            <header className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-text-primary">Cognitive Skills Profiler</h1>
                <p className="mt-2 text-text-secondary">
                    Welcome! Select your skills. A 15-minute test for one, or a 30-minute test for more.
                </p>
            </header>
            <main className="space-y-3">
                {categories.map(category => (
                    <CategoryCard
                        key={category.id}
                        category={category}
                        onSelect={handleSelect}
                        isSelected={selected.has(category.id)}
                    />
                ))}
            </main>
            <footer className="mt-8">
                <button
                    onClick={handleStart}
                    disabled={selected.size === 0}
                    className="w-full bg-primary text-background font-bold py-3 px-4 rounded-lg transition-colors duration-200 enabled:hover:bg-primary-hover disabled:bg-primary/50 disabled:cursor-not-allowed"
                >
                    Start Test ({selected.size} selected)
                </button>
            </footer>
        </div>
    );
};

const TestScreen = ({ questions, onSubmit, timeLimit }: { questions: Question[], onSubmit: (answers: UserAnswer) => void, timeLimit: number }) => {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<UserAnswer>({});
    const [timeLeft, setTimeLeft] = useState(timeLimit);

    // --- HOOK 1: The Countdown Timer ---
    // This hook ONLY handles the countdown.
    // It re-runs ONLY when a new test starts (when timeLimit changes).
    useEffect(() => {
        // First, reset the timer to the full amount.
        setTimeLeft(timeLimit);

        // Don't start a countdown if the time is 0.
        if (timeLimit <= 0) return;

        const timer = setInterval(() => {
            // Use a functional update so we don't depend on 'timeLeft'.
            setTimeLeft(prevTime => {
                if (prevTime <= 1) {
                    clearInterval(timer);
                    return 0; // Just stop at 0.
                }
                return prevTime - 1;
            });
        }, 1000);

        // This cleanup function runs when a new test starts.
        return () => clearInterval(timer);

    }, [timeLimit]); // <-- This hook ONLY depends on timeLimit.

    // --- HOOK 2: The "Submit on Timeout" Watcher ---
    // This separate hook ONLY watches for the timer to hit zero.
    useEffect(() => {
        if (timeLeft === 0 && questions.length > 0) {
            // Time is up, submit the answers.
            onSubmit(userAnswers);
        }
        // This hook depends on userAnswers, but that's okay!
        // It re-runs when you select an answer, but since
        // timeLeft is not 0, it does nothing.
    }, [timeLeft, questions.length, onSubmit, userAnswers]);

    const handleAnswerSelect = (answerIndex: number) => {
        const currentQuestionId = questions[currentQuestionIndex].id.toString(); // Use string key
        setUserAnswers(prev => ({ ...prev, [currentQuestionId]: answerIndex }));
    };

    const handleNext = () => {
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };
    
    const handlePrev = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };

    const currentQuestion = questions[currentQuestionIndex];
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col h-[calc(100vh-2rem)]">
            <header className="mb-6">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-medium text-text-secondary">Question {currentQuestionIndex + 1}/{questions.length}</p>
                    <p className="text-sm font-medium text-primary tabular-nums">{minutes}:{seconds.toString().padStart(2, '0')} remaining</p>
                </div>
                <div className="w-full bg-border rounded-full h-2.5">
                    <div className="bg-primary h-2.5 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}></div>
                </div>
            </header>

            <main className="flex-grow">
                <div className="backdrop-blur-md bg-white/5 border border-white/10 p-6 rounded-lg">
                    <p className="text-sm font-semibold text-primary mb-2">Category: {currentQuestion.category}</p>
                    <h2 className="text-xl sm:text-2xl font-semibold text-text-primary mb-6">{currentQuestion.questionText}</h2>
                    <div className="space-y-3">
                        {currentQuestion.options.map((option, index) => {
                            const isSelected = userAnswers[currentQuestion.id.toString()] === index;
                            return (
                                <button
                                    key={option}
                                    onClick={() => handleAnswerSelect(index)}
                                    className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 ${isSelected ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/10 hover:border-primary/50'}`}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </main>

            <footer className="mt-6 flex justify-between">
                 <button 
                    onClick={handlePrev} 
                    disabled={currentQuestionIndex === 0}
                    className="bg-white/5 border-2 border-border text-text-primary font-bold py-3 px-6 rounded-lg transition-colors duration-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Previous
                </button>
                {currentQuestionIndex < questions.length - 1 ? (
                    <button 
                        onClick={handleNext} 
                        className="bg-primary text-background font-bold py-3 px-6 rounded-lg transition-colors duration-200 hover:bg-primary-hover"
                    >
                        Next
                    </button>
                ) : (
                    <button 
                        onClick={() => onSubmit(userAnswers)}
                        className="bg-primary text-background font-bold py-3 px-6 rounded-lg transition-colors duration-200 hover:bg-primary-hover"
                    >
                        Submit Answers
                    </button>
                )}
            </footer>
        </div>
    );
};

const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center h-screen p-4">
        <div className="text-center p-8 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-lg text-text-secondary">Waiting</p>
        </div>
    </div>
);

const ResultsScreen = ({ results, analysis, onTestAgain, error }: { results: TestResults, analysis: Analysis | null, onTestAgain: () => void, error: string | null }) => {
    
    const ResultBar = ({ label, correct, total }: { label: string, correct: number, total: number }) => {
        const percentage = total > 0 ? (correct / total) * 100 : 0;
        return (
            <div>
                <div className="flex justify-between items-center mb-1">
                    <p className="font-medium text-text-primary">{label}</p>
                    <p className="font-semibold text-primary">{correct}/{total}</p>
                </div>
                <div className="w-full bg-border rounded-full h-4 overflow-hidden">
                    <div 
                        className="bg-primary h-4 rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${percentage}%` }}
                    ></div>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-8">
            <header className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-text-primary">Your Cognitive Profile</h1>
            </header>

            <main className="space-y-8">
                <section className="backdrop-blur-md bg-white/5 border border-white/10 p-6 rounded-lg text-center">
                    <h2 className="text-lg font-semibold text-text-secondary mb-2">Overall Score</h2>
                    <p className="text-5xl font-bold text-primary">
                        {results.totalCorrect}<span className="text-3xl text-text-secondary">/{results.totalQuestions}</span>
                    </p>
                    <p className="text-text-secondary mt-1">Correct</p>
                </section>

                <section className="backdrop-blur-md bg-white/5 border border-white/10 p-6 rounded-lg">
                    <h2 className="text-xl font-bold text-text-primary mb-4">Per-Category Breakdown</h2>
                    <div className="space-y-4">
                        {Object.entries(results.categoryResults)
                            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                            .map(([categoryName, categoryResult]) => (
                            <ResultBar 
                                key={categoryName}
                                label={categoryName}
                                correct={categoryResult.correct}
                                total={categoryResult.total}
                            />
                        ))}
                    </div>
                </section>
                
                <section className="backdrop-blur-md bg-white/5 border border-white/10 p-6 rounded-lg">
                    <h2 className="text-xl font-bold text-text-primary mb-4">Your AI Coach's Analysis</h2>
                    {error && <div className="bg-red-900/50 border border-red-400 text-red-200 px-4 py-3 rounded relative" role="alert"><strong className="font-bold">Error:</strong><span className="block sm:inline"> {error}</span></div>}
                    {!analysis && !error && <div className="text-center text-text-secondary">Loading analysis...</div>}
                    {analysis && (
                        <div className="space-y-6 text-text-secondary leading-relaxed">
                            <div>
                                <h3 className="font-semibold text-text-primary text-lg mb-1">{analysis.title}</h3>
                                <p>{analysis.overall_summary}</p>
                            </div>
                             <div>
                                <h3 className="font-semibold text-text-primary text-lg mb-1">Strengths Analysis</h3>
                                <p>{analysis.strengths_analysis}</p>
                            </div>
                             <div>
                                <h3 className="font-semibold text-text-primary text-lg mb-1">Growth Opportunities</h3>
                                <p>{analysis.growth_analysis}</p>
                            </div>
                             <div>
                                <h3 className="font-semibold text-text-primary text-lg mb-1">Action Item</h3>
                                <p className="border-l-4 border-primary pl-4 italic">{analysis.action_item}</p>
                            </div>
                        </div>
                    )}
                </section>
            </main>

            <footer className="mt-8 text-center">
                <button 
                    onClick={onTestAgain}
                    className="bg-primary text-background font-bold py-3 px-8 rounded-lg transition-colors duration-200 hover:bg-primary-hover"
                >
                    Test Again
                </button>
            </footer>
        </div>
    );
};

const App = () => {
    const [screen, setScreen] = useState<Screen>('selection');
    const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
    const [testResults, setTestResults] = useState<TestResults | null>(null);
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [timeLimit, setTimeLimit] = useState<number>(0);
    
   
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                // Call our new backend!
                const response = await fetch(`${API_BASE_URL}/categories`);
                if (!response.ok) {
                    throw new Error('Failed to fetch categories');
                }
                const data: Category[] = await response.json();
                setAllCategories(data); // <-- Save categories in state
            } catch (e) {
                if (e instanceof Error) setError(e.message);
                else setError("Failed to load categories.");
            }
        };
        fetchCategories();
    }, []);

    const handleStartTest = useCallback(async (categories: Category[]) => {
        setScreen('loading'); // Show the loading spinner
        setError(null);

        // Get the list of IDs to send, e.g., ["verbal-logic", "memory"]
        const categoryIds = categories.map(c => c.id);

        try {
            // Call our backend's /start-test endpoint
            const response = await fetch(`${API_BASE_URL}/start-test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categories: categoryIds })
            });

            if (!response.ok) {
                // If the server sends an error, show it
                const err = await response.json();
                throw new Error(err.detail || 'Failed to start test');
            }

            // Get back our new { questions, timeLimitSeconds } object
            const data: { questions: Question[], timeLimitSeconds: number } = await response.json();

            // Save the REAL quiz data in our state
            setQuizQuestions(data.questions);
            setTimeLimit(data.timeLimitSeconds); // <-- Set the dynamic timer!

            // Reset old results
            setTestResults(null);
            setAnalysis(null);
            setScreen('test'); // Go to the test screen

        } catch (e) {
            if (e instanceof Error) setError(e.message);
            else setError("An unknown error occurred.");
            setScreen('selection'); // Go back to selection on error
        }
    }, []); // This dependency array is correct

    const handleSubmitTest = useCallback(async (answers: UserAnswer) => {
        setScreen('loading');
        setError(null);
        const backendAnswers = Object.entries(answers).map(([qid, option]) => ({
            questionId: parseInt(qid),
            selectedOption: option
        }));

        try {
            const response = await fetch(`${API_BASE_URL}/submit-test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers: backendAnswers })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to submit test');
            }

            const data: SubmitResponse = await response.json();

            setTestResults(data.results); // This will show the real scores
            setAnalysis(data.analysis); // This will show the AI analysis

        } catch (e) {
            if (e instanceof Error) setError(e.message);
            else setError("An unknown error occurred while fetching your analysis.");
        } finally {
            setScreen('results');
        }
    }, []); 
    
    const handleTestAgain = useCallback(() => {
        setScreen('selection');
        setQuizQuestions([]);
        setTestResults(null);
        setAnalysis(null);
        setError(null);
    }, []);

    const renderScreen = () => {
        switch (screen) {
            case 'selection':
                return <CategorySelectionScreen categories={allCategories} onStartTest={handleStartTest} />;
            case 'test':
                return <TestScreen questions={quizQuestions} onSubmit={handleSubmitTest} timeLimit={timeLimit} />;
            case 'loading':
                return <LoadingScreen />;
            case 'results':
                if (!testResults) return <LoadingScreen />;
                return <ResultsScreen results={testResults} analysis={analysis} onTestAgain={handleTestAgain} error={error} />;
            default:
                return <CategorySelectionScreen categories={allCategories} onStartTest={handleStartTest} />;
        }
    };

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            {/* Decorative blobs for glassmorphism effect */}
            <div className="absolute top-[-50px] left-[-100px] w-[500px] h-[500px] bg-primary/30 rounded-full filter blur-[150px] animate-blob-spin"></div>
            <div className="absolute bottom-[-100px] right-[-150px] w-[600px] h-[600px] bg-secondary/30 rounded-full filter blur-[150px] animate-blob-spin [animation-delay:2s]"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-accent/20 rounded-full filter blur-[120px] animate-blob-spin [animation-delay:4s]"></div>

            <div className="relative z-10">
                {renderScreen()}
            </div>
        </div>
    );
};

export default App;
