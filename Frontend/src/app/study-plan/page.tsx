"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/AppShell";
import styles from "./study-plan.module.css";

interface StudyBoxItem {
  id: number;
  subject: string;
  topic: string;
  duration: number; // in minutes
  completed: boolean;
}

interface UpcomingGoal {
  id: number;
  goal: string;
  date: string;
  completed: boolean;
}

export default function StudyPlanPage() {
  const [studyBlocks, setStudyBlocks] = useState<StudyBoxItem[]>([]);
  const [upcomingGoals, setUpcomingGoals] = useState<UpcomingGoal[]>([]);
  
  // Form states
  const [newSubject, setNewSubject] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newDuration, setNewDuration] = useState("30");
  
  const [newGoalText, setNewGoalText] = useState("");
  const [newGoalDate, setNewGoalDate] = useState("");

  useEffect(() => {
    // Load study blocks
    const storedBlocks = localStorage.getItem("sbud_study_blocks");
    if (storedBlocks) {
      setStudyBlocks(JSON.parse(storedBlocks));
    } else {
      const defaultBlocks = [
        { id: 1, subject: "Physics", topic: "Momentum", duration: 30, completed: false },
        { id: 2, subject: "Biology", topic: "Mitosis", duration: 20, completed: false },
        { id: 3, subject: "Chemistry", topic: "Acids & Bases", duration: 15, completed: false },
      ];
      setStudyBlocks(defaultBlocks);
      localStorage.setItem("sbud_study_blocks", JSON.stringify(defaultBlocks));
    }

    // Load upcoming goals
    const storedGoals = localStorage.getItem("sbud_upcoming_goals");
    if (storedGoals) {
      setUpcomingGoals(JSON.parse(storedGoals));
    } else {
      const defaultGoals = [
        { id: 1, goal: "Complete Momentum Quiz", date: "Tomorrow", completed: false },
        { id: 2, goal: "Review Physics notes on Gravity", date: "Friday", completed: false },
        { id: 3, goal: "Study Mitosis diagram in Biology", date: "Next Monday", completed: false },
      ];
      setUpcomingGoals(defaultGoals);
      localStorage.setItem("sbud_upcoming_goals", JSON.stringify(defaultGoals));
    }
  }, []);

  const saveBlocks = (blocks: StudyBoxItem[]) => {
    setStudyBlocks(blocks);
    localStorage.setItem("sbud_study_blocks", JSON.stringify(blocks));
  };

  const saveGoals = (goals: UpcomingGoal[]) => {
    setUpcomingGoals(goals);
    localStorage.setItem("sbud_upcoming_goals", JSON.stringify(goals));
  };

  // Add Today's study block
  const handleAddBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newTopic.trim()) return;

    const newBlock: StudyBoxItem = {
      id: Date.now(),
      subject: newSubject.trim(),
      topic: newTopic.trim(),
      duration: parseInt(newDuration) || 30,
      completed: false,
    };

    const updated = [...studyBlocks, newBlock];
    saveBlocks(updated);
    
    // Reset Form
    setNewSubject("");
    setNewTopic("");
    setNewDuration("30");
  };

  const handleDeleteBlock = (id: number) => {
    const updated = studyBlocks.filter((b) => b.id !== id);
    saveBlocks(updated);
  };

  const handleToggleBlock = (id: number) => {
    const updated = studyBlocks.map((b) => 
      b.id === id ? { ...b, completed: !b.completed } : b
    );
    saveBlocks(updated);
  };

  // Add Upcoming goal/task
  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim() || !newGoalDate.trim()) return;

    const newGoal: UpcomingGoal = {
      id: Date.now(),
      goal: newGoalText.trim(),
      date: newGoalDate.trim(),
      completed: false,
    };

    const updated = [...upcomingGoals, newGoal];
    saveGoals(updated);

    // Reset Form
    setNewGoalText("");
    setNewGoalDate("");
  };

  const handleDeleteGoal = (id: number) => {
    const updated = upcomingGoals.filter((g) => g.id !== id);
    saveGoals(updated);
  };

  const handleToggleGoal = (id: number) => {
    const updated = upcomingGoals.map((g) =>
      g.id === id ? { ...g, completed: !g.completed } : g
    );
    saveGoals(updated);
  };

  const handleClearCompleted = () => {
    const updatedBlocks = studyBlocks.filter((b) => !b.completed);
    saveBlocks(updatedBlocks);
    
    const updatedGoals = upcomingGoals.filter((g) => !g.completed);
    saveGoals(updatedGoals);
  };

  return (
    <AppShell>
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Study Plan Planner</h1>
            <p className={styles.desc}>Organize your study blocks for today and schedule upcoming milestones. Checked items are tracked in localStorage and sync dynamically to your main dashboard page.</p>
          </div>
          
          <button className={styles.clearBtn} onClick={handleClearCompleted}>
            Clear Completed Tasks
          </button>
        </div>

        <div className={styles.layoutGrid}>
          {/* Study blocks section */}
          <div className={styles.column}>
            <div className={styles.formCard}>
              <h2 className={styles.cardHeader}>Add Today's Study Block</h2>
              <form onSubmit={handleAddBlock} className={styles.form}>
                <div className={styles.formGroup}>
                  <label>Subject</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Physics" 
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Topic / Area</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Momentum" 
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Duration (Minutes)</label>
                  <select 
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                  >
                    <option value="15">15 mins</option>
                    <option value="20">20 mins</option>
                    <option value="30">30 mins</option>
                    <option value="45">45 mins</option>
                    <option value="60">60 mins</option>
                  </select>
                </div>
                <button type="submit" className={styles.submitBtn}>Create Block</button>
              </form>
            </div>

            <div className={styles.listCard}>
              <h2 className={styles.cardHeader}>Today's Active Blocks</h2>
              <div className={styles.list}>
                {studyBlocks.map((block) => (
                  <div key={block.id} className={`${styles.listItem} ${block.completed ? styles.itemCompleted : ""}`}>
                    <div 
                      className={styles.checkbox}
                      onClick={() => handleToggleBlock(block.id)}
                    >
                      {block.completed && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 12, height: 12 }}>
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className={styles.details}>
                      <span className={styles.itemTitle}>{block.subject}</span>
                      <span className={styles.itemSubText}>{block.topic} ({block.duration} min)</span>
                    </div>
                    <button className={styles.deleteBtn} onClick={() => handleDeleteBlock(block.id)} title="Delete block">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m6 18 12-12M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {studyBlocks.length === 0 && (
                  <div className={styles.emptyText}>No active blocks today. Schedule one above!</div>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming goals section */}
          <div className={styles.column}>
            <div className={styles.formCard}>
              <h2 className={styles.cardHeader}>Add Upcoming Task / Deadline</h2>
              <form onSubmit={handleAddGoal} className={styles.form}>
                <div className={styles.formGroup}>
                  <label>Milestone Target</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Newton's Laws Quiz" 
                    value={newGoalText}
                    onChange={(e) => setNewGoalText(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Target Date</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Friday, Tomorrow, Next Monday" 
                    value={newGoalDate}
                    onChange={(e) => setNewGoalDate(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className={styles.submitBtn}>Schedule Task</button>
              </form>
            </div>

            <div className={styles.listCard}>
              <h2 className={styles.cardHeader}>Upcoming Milestones</h2>
              <div className={styles.list}>
                {upcomingGoals.map((goal) => (
                  <div key={goal.id} className={`${styles.listItem} ${goal.completed ? styles.itemCompleted : ""}`}>
                    <div 
                      className={styles.checkbox}
                      onClick={() => handleToggleGoal(goal.id)}
                    >
                      {goal.completed && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 12, height: 12 }}>
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className={styles.details}>
                      <span className={styles.itemTitle}>{goal.goal}</span>
                      <span className={styles.itemSubText}>{goal.date}</span>
                    </div>
                    <button className={styles.deleteBtn} onClick={() => handleDeleteGoal(goal.id)} title="Delete milestone">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m6 18 12-12M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {upcomingGoals.length === 0 && (
                  <div className={styles.emptyText}>All deadlines complete! Plan your next study goal.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
