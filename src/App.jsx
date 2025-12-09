import React, { useState, useEffect, useRef } from "react";
import "./styles.css";

export default function App() {
  const [messages, setMessages] = useState([
    { id: 1, role: "assistant", text: "Halo — saya Tech-C Bot. Tanyakan apa saja tentang TECH-C." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [dark, setDark] = useState(true);
  const [voiceActive, setVoiceActive] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function addMessage(role, text) {
    setMessages((prev) => [...prev, { id: Date.now(), role, text }]);
  }

  async function handleSend(e, quick = false) {
    e?.preventDefault();
    const text = (typeof quick === "string" ? quick : input).trim();
    if (!text) return;

    addMessage("user", text);
    if (!quick) setInput("");
    setLoading(true);
    setTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Server error");
      }
      const data = await res.json();
      // simulate streaming / typing effect
      const reply = data.reply || "(no reply)";
      // optional: progressive reveal
      for (let i = 1; i <= reply.length; i += 12) {
        const part = reply.slice(0, i);
        if (i === 1) addMessage("assistant", part);
        else setMessages((prev) => {
          // replace last assistant text
          const copy = [...prev];
          const lastIdx = copy.map(m => m.role).lastIndexOf("assistant");
          if (lastIdx >= 0) copy[lastIdx].text = part;
          return copy;
        });
        await new Promise(r => setTimeout(r, 40));
      }
      // ensure final
      setMessages((prev) => {
        const copy = [...prev];
        const lastIdx = copy.map(m => m.role).lastIndexOf("assistant");
        if (lastIdx >= 0) copy[lastIdx].text = reply;
        return copy;
      });
    } catch (err) {
      console.error(err);
      addMessage("assistant", "Terjadi kesalahan: " + (err.message || err));
    } finally {
      setLoading(false);
      setTimeout(() => setTyping(false), 300);
    }
  }

  const quickReplies = [
    "Ceritakan profil TECH-C singkat.",
    "Jelaskan layanan Robotic Education.",
    "Buat kalimat promosi 30 kata untuk Instagram."
  ];

  function toggleVoice() {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Voice recognition not supported in this browser. Use Chrome.");
      return;
    }

    if (voiceActive) {
      recognitionRef.current?.stop();
      setVoiceActive(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = "id-ID";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " : "") + transcript);
    };
    rec.onend = () => setVoiceActive(false);
    rec.onerror = (e) => {
      console.error("Speech error", e);
      setVoiceActive(false);
    };

    recognitionRef.current = rec;
    rec.start();
    setVoiceActive(true);
  }

  function clearChat() {
    setMessages([{ id: Date.now(), role: "assistant", text: "Halo — saya Tech-C Bot. Tanyakan apa saja tentang TECH-C." }]);
  }

  function renderText(text) {
    if (!text) return "";
    let out = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noreferrer">$1</a>'
      );
    // simple newline -> <br/>
    out = out.replace(/\n/g, "<br/>");
    return { __html: out };
  }

  return (
    <div className="page">
      <div className="app-shell">
        <header className="app-header" role="banner">
          <div className="header-left">
           {/* robot JPG instead of SVG */}
<img 
  src="/logo tech new.png" 
  width="70" 
  height="20" 
  alt="Robot Icon"
  style={{ borderRadius: "6px" }}
/>

            <div className="header-title">
              <div className="brand">Tech-C Bot</div>
              <div className="tagline">Robotics • Coding • Learning</div>
            </div>
          </div>

          <div className="header-actions">
            <button className="icon-btn" title="Toggle theme" onClick={() => setDark(d => !d)}>
              {dark ? "🌙" : "☀️"}
            </button>
            <button className={`icon-btn ${voiceActive ? "active" : ""}`} title="Voice input" onClick={toggleVoice}>
              🎙
            </button>
            <button className="icon-btn" title="Clear chat" onClick={clearChat}>🧹</button>
          </div>
        </header>

        <main className="chat-main">
          <aside className="left-panel">
            <div className="panel-card">
              <h4>About TECH-C</h4>
              <p className="muted">Tech-C Robotic Coding — pendidikan robotik & coding untuk anak & remaja. Gunakan chat untuk minta profil, promosi, atau materi pelajaran.</p>
              <hr />
              <h5>Quick actions</h5>
              <div className="quick-list">
                <button onClick={() => handleSend(null, "Buatkan ringkasan 3 poin tentang TECH-C")} className="mini">Ringkas 3 poin</button>
                <button onClick={() => handleSend(null, "Buat caption Instagram 20 kata untuk TECH-C")} className="mini">Caption IG</button>
                <button onClick={() => handleSend(null, "Buat outline materi robotik dasar untuk 4 sesi")} className="mini">Outline materi</button>
              </div>
            </div>
            <div className="panel-card small">
              <h5>Tips</h5>
              <ul className="muted">
                <li>Untuk jawaban lengkap, tanyakan spesifik (contoh: "Rincikan paket X").</li>
                <li>Gunakan voice untuk input cepat.</li>
              </ul>
            </div>
          </aside>

          <section className="chat-col">
            <div className="chat-window">
              {messages.map((m) => (
                <div key={m.id} className={`msg-row ${m.role === "user" ? "user" : "assistant"}`}>
                  <div className="avatar">{m.role === "user" ? "🧑" : "🤖"}</div>
                  <div className="bubble" dangerouslySetInnerHTML={renderText(m.text)} />
                </div>
              ))}

              {typing && (
                <div className="msg-row assistant">
                  <div className="avatar">🤖</div>
                  <div className="bubble typing">
                    <span className="dot" /> <span className="dot" /> <span className="dot" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="composer">
              <div className="quick-chips">
                {quickReplies.map((q, i) => (
                  <button key={i} className="chip" onClick={() => handleSend(null, q)}>{q}</button>
                ))}
              </div>

              <form onSubmit={handleSend} className="compose-form">
                <input
                  className="input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Tulis pesan atau tekan Voice..."
                  disabled={loading}
                />
                <div className="compose-actions">
                  <button type="button" className="icon-small" onClick={() => { setInput(""); }}>
                    ✏️
                  </button>
                  <button type="submit" className="send-btn" disabled={loading}>
                    {loading ? "..." : "Kirim"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </main>

        <button className="fab" onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })} title="Scroll to bottom">⬇️</button>
      </div>
    </div>
  );
}
