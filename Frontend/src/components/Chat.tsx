"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Message, MessageProps } from "./Message";
import { ChatInput } from "./ChatInput";
import styles from "./Chat.module.css";

const API_BASE = "http://localhost:8000";

const INITIAL_MESSAGES: MessageProps[] = [
  {
    role: "assistant",
    content: "Hi! I'm **SBud**, your AI study tutor. I'm here to help you understand complex concepts step-by-step.\n\nWhat would you like to study today? (e.g., Photosynthesis, Gravity, Mitosis, or paste a homework question!)",
  }
];

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<MessageProps[]>(INITIAL_MESSAGES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Scroll to bottom on new messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Authenticate user on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(`${API_BASE}/users/me`, {
          method: "GET",
          credentials: "include", // Transmits secure HttpOnly cookie
        });

        if (!response.ok) {
          throw new Error("Unauthenticated user session.");
        }

        const data = await response.json();
        setUserEmail(data.email);
        setIsInitializing(false);
      } catch (err) {
        console.warn("Auth check failed, redirecting to login:", err);
        router.push("/login");
      }
    };

    checkAuth();
  }, [router]);

  const handleSendMessage = async (text: string) => {
    // Append user message immediately
    const userMessage: MessageProps = {
      role: "user",
      content: text,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      // Map frontend messages to match backend ChatRequest format
      const mappedMessages = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call backend /chat with credentials: "include" to transmit the HttpOnly access_token cookie
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          messages: mappedMessages,
          conversation_id: conversationId
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Server returned an error responding to your request.");
      }

      const data = await response.json();
      
      const assistantMessage: MessageProps = {
        role: "assistant",
        content: data.reply,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setConversationId(data.conversation_id);
    } catch (err: any) {
      console.error("Failed to send message:", err);
      setError(err.message || "Failed to communicate with tutor. Please check your network connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (e) {
      console.error("Logout request failed:", e);
    } finally {
      router.push("/login");
    }
  };

  const handleRetry = () => {
    setError(null);
    const lastUserMsg = [...messages].reverse().find(msg => msg.role === "user");
    if (lastUserMsg) {
      setMessages(prev => prev.filter((_, idx) => idx !== prev.lastIndexOf(lastUserMsg)));
      handleSendMessage(lastUserMsg.content);
    }
  };

  return (
    <div className={styles.chatWrapper}>
      {/* Header Bar */}
      <header className={styles.header}>
        <div className={styles.logoGroup}>
          <div className={styles.logoGlow} />
          <h1 className={styles.logo}>SBud</h1>
          <span className={styles.tagline}>AI Study Tutor</span>
        </div>
        
        <div className={styles.headerControls}>
          {userEmail && (
            <span className={styles.userEmail} title={userEmail}>
              {userEmail.split("@")[0]}
            </span>
          )}
          <button onClick={handleLogout} className={styles.logoutButton} aria-label="Log Out">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={styles.logoutIcon}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <main className={styles.chatArea}>
        {isInitializing ? (
          <div className={styles.initializingContainer}>
            <div className={styles.spinner} />
            <p>Initializing SBud secure tutor connection...</p>
          </div>
        ) : (
          <div className={styles.messagesList}>
            {messages.map((msg, index) => (
              <Message key={index} role={msg.role} content={msg.content} createdAt={msg.createdAt} />
            ))}
            
            {/* Loading Typing Indicator */}
            {isLoading && (
              <div className={styles.typingIndicatorContainer}>
                <div className={styles.avatarMini}>SB</div>
                <div className={styles.typingBubble}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div className={styles.errorBanner}>
                <div className={styles.errorContent}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.errorIcon}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <span>{error}</span>
                </div>
                <button className={styles.retryButton} onClick={handleRetry}>Retry</button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Tray */}
      <footer className={styles.footer}>
        <div className={styles.inputWrapper}>
          <ChatInput onSendMessage={handleSendMessage} disabled={isLoading || isInitializing} />
        </div>
        <p className={styles.footerNote}>
          SBud is designed to guide your study. Tip: Ask it to break things down!
        </p>
      </footer>
    </div>
  );
};
