import React from "react";
import styles from "./Message.module.css";

export interface MessageProps {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export const Message: React.FC<MessageProps> = ({ role, content, createdAt }) => {
  const isUser = role === "user";

  // Simple formatter to parse **bold** and * bullet points for premium rendering
  const renderFormattedContent = (text: string) => {
    return text.split("\n").map((line, index) => {
      let formattedLine = line;
      
      // Parse Bold **text**
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;
      
      while ((match = boldRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index));
        }
        parts.push(<strong key={match.index}>{match[1]}</strong>);
        lastIndex = boldRegex.lastIndex;
      }
      if (lastIndex < line.length) {
        parts.push(line.substring(lastIndex));
      }

      const contentNode = parts.length > 0 ? parts : line;

      // Parse Bullet points starting with *
      if (line.trim().startsWith("*")) {
        const cleanText = line.replace(/^\s*\*\s*/, "");
        return (
          <li key={index} className={styles.listItem}>
            {cleanText}
          </li>
        );
      }

      if (line.trim() === "") {
        return <div key={index} className={styles.emptyLine} />;
      }

      return <p key={index} className={styles.paragraph}>{contentNode}</p>;
    });
  };

  return (
    <div className={`${styles.messageContainer} ${isUser ? styles.userContainer : styles.assistantContainer}`}>
      <div className={styles.avatar}>
        {isUser ? (
          <div className={`${styles.avatarIcon} ${styles.userAvatar}`}>ST</div>
        ) : (
          <div className={`${styles.avatarIcon} ${styles.assistantAvatar}`}>SB</div>
        )}
      </div>
      
      <div className={styles.bubbleWrapper}>
        <div className={styles.senderName}>
          {isUser ? "You" : "SBud (AI Tutor)"}
          {createdAt && <span className={styles.timestamp}>{createdAt}</span>}
        </div>
        <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
          <div className={styles.content}>
            {renderFormattedContent(content)}
          </div>
        </div>
      </div>
    </div>
  );
};
