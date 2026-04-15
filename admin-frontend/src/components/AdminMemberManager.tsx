import React, { useState } from "react";
import { api } from "../api/client";

export function AdminMemberManager() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setMessage("");
    
    try {
      const response = await api.promoteToAdmin(email.trim());
      setStatus("success");
      setMessage(response.message || "Successfully promoted user to admin.");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to promote user.");
    }
  };

  return (
    <section className="panel" style={{ marginTop: "1.5rem" }}>
      <header className="panel-header">
        <h2>Add Admin Member</h2>
        <p>Grant admin privileges to an existing user via their registered email address.</p>
      </header>
      
      <div style={{ padding: "0 1.5rem 1.5rem 1.5rem" }}>
        <form onSubmit={handlePromote} style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 300px" }}>
            <label htmlFor="adminEmail" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, fontSize: "0.9rem" }}>
              User Email Address
            </label>
            <input
              id="adminEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. colleague@university.edu"
              required
              disabled={status === "loading"}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
                fontSize: "1rem"
              }}
            />
          </div>
          
          <div style={{ alignSelf: "flex-end" }}>
            <button 
              type="submit" 
              className="action-button primary"
              disabled={status === "loading" || !email.trim()}
              style={{ padding: "0.75rem 1.5rem" }}
            >
              {status === "loading" ? "Promoting..." : "Promote to Admin"}
            </button>
          </div>
        </form>

        {message && (
          <div style={{ 
            marginTop: "1rem", 
            padding: "0.75rem", 
            borderRadius: "6px", 
            backgroundColor: status === "success" ? "#f0fdf4" : "#fef2f2",
            color: status === "success" ? "#166534" : "#991b1b",
            fontSize: "0.9rem"
          }}>
            {message}
          </div>
        )}
      </div>
    </section>
  );
}
