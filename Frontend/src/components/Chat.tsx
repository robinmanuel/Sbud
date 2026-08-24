"use client";

import React, { useState, useEffect, useRef } from "react";
import { Message, MessageProps } from "./Message";
import { ChatInput } from "./ChatInput";
import styles from "./Chat.module.css";

const API_BASE = "http://localhost:8000";
const GUEST_EMAIL = "guest_student@sbud.local";
const GUEST_PASSWORD = "guestpassword123";

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
  const [token, setToken] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Silent authentication on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        let savedToken = localStorage.getItem("sbud_token");
        if (savedToken) {
          setToken(savedToken);
          setIsInitializing(false);
          return;
        }

        // Try login first
        try {
          const loginResp = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: GUEST_EMAIL, password: GUEST_PASSWORD }),
          });

          if (loginResp.ok) {
            const data = await loginResp.json();
            localStorage.setItem("sbud_token", data.access_token);
            setToken(data.access_token);
            setIsInitializing(false);
            return;
          }
        } catch (e) {
          // If network error, let it fall through to registration
        }

        // If login failed, register the guest user
        const registerResp = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: GUEST_EMAIL, password: GUEST_PASSWORD }),
        });

        if (!registerResp.ok && registerResp.status !== 400) {
          throw new Error("Failed to register guest user account.");
        }

        // Login after registration
        const loginResp = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: GUEST_EMAIL, password: GUEST_PASSWORD }),
        });

        if (!loginResp.ok) {
          throw new Error("Failed to login to guest user account.");
        }

        const data = await loginResp.json();
        localStorage.setItem("sbud_token", data.access_token);
        setToken(data.access_token);
      } catch (err: any) {
        console.error("Auth initialization failed:", err);
        setError("Failed to connect to the backend server. Please make sure the FastAPI server is running.");
      } finally {
        setIsInitializing(false);
      }
    };

    initializeAuth();
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!token) {
      setError("No authentication token available. Retrying connection...");
      localStorage.removeItem("sbud_token");
      window.location.reload();
      return;
    }

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
      // Map frontend messages to match backend ChatRequest format (excluding system prompt & timestamp)
      const mappedMessages = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call backend /chat
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: mappedMessages,
          conversation_id: conversationId
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          localStorage.removeItem("sbud_token");
          throw new Error("Authentication expired. Retrying connection...");
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

  const handleRetry = () => {
    setError(null);
    // Grab the last user message in the list to retry sending it
    const lastUserMsg = [...messages].reverse().find(msg => msg.role === "user");
    if (lastUserMsg) {
      // Remove last user message from current list because handleSendMessage will re-append it
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
        <div className={styles.statusIndicator}>
          {isInitializing ? (
            <>
              <span className={`${styles.statusDot} ${styles.statusConnecting}`} />
              Connecting
            </>
          ) : token ? (
            <>
              <span className={styles.statusDot} />
              Online
            </>
          ) : (
            <>
              <span className={`${styles.statusDot} ${styles.statusOffline}`} />
              Offline
            </>
          )}
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
                {token && <button className={styles.retryButton} onClick={handleRetry}>Retry</button>}
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
