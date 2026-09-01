import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentActivity,
  ApprovalRequest,
  ChatMessage,
  ConversationSummary,
  ModelOption,
  StreamEvent,
} from '@cloudbrain/shared';
import { apiClient } from '../api';
import { useRealtime } from '../hooks';

export function ChatPage(): React.ReactElement {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [phase, setPhase] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [liveActivity, setLiveActivity] = useState<AgentActivity | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [mode, setMode] = useState<'quick' | 'agent' | 'deep'>('quick');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const { conversations: c } = await apiClient.conversations();
    setConversations(c);
  }, []);

  useEffect(() => {
    void loadConversations();
    void apiClient
      .models()
      .then(({ models: m, default: d }) => {
        setModels(m.filter((x) => x.available));
        setSelectedModel(d);
      })
      .catch(() => undefined);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) return;
    setStreamingText('');
    setLiveActivity(null);
    void apiClient
      .messages(activeId)
      .then(({ messages: m }) => setMessages(m))
      .catch(() => setMessages([]));
  }, [activeId]);

  // Realtime stream
  const onEvent = useCallback(
    (event: StreamEvent) => {
      if (event.type === 'token') {
        setStreamingText((t) => t + event.text);
      } else if (event.type === 'status') {
        setPhase(event.type === 'status' ? event.phase : null);
        if (event.phase === 'done' || event.phase === 'error') {
          setPhase(null);
          setStreamingText('');
          if (activeId) {
            void apiClient
              .messages(activeId)
              .then(({ messages: m }) => setMessages(m))
              .catch(() => undefined);
          }
        }
      } else if (event.type === 'activity') {
        setLiveActivity(event.activity);
      } else if (event.type === 'approval') {
        setPendingApproval(event.approval);
      } else if (event.type === 'error') {
        setPhase(null);
        setStreamingText('');
      }
    },
    [activeId]
  );
  useRealtime(true, onEvent);

  // Refresh activity feed in the open conversation when streaming settles.
  useEffect(() => {
    if (phase === null && liveActivity && activeId && !streamingText) {
      void apiClient
        .messages(activeId)
        .then(({ messages: m }) => setMessages(m))
        .catch(() => undefined);
      setLiveActivity(null);
    }
  }, [phase, activeId, liveActivity, streamingText]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingText]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setStreamingText('');
    setMessages((m) => [
      ...m,
      {
        id: `local_${Date.now()}`,
        conversationId: activeId ?? '',
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      const { conversationId } = await apiClient.send({
        conversationId: activeId ?? undefined,
        message: text,
        mode,
        model: selectedModel || undefined,
      });
      if (!activeId) {
        setActiveId(conversationId);
        void loadConversations();
      }
    } catch (err) {
      setPhase(null);
      alert(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  };

  const decide = async (decision: 'approve_once' | 'always' | 'deny') => {
    if (!pendingApproval) return;
    await apiClient.decideApproval(pendingApproval.id, decision).catch(() => undefined);
    setPendingApproval(null);
  };

  const newChat = async () => {
    setActiveId(null);
    setMessages([]);
    setStreamingText('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100%' }}>
      {/* Conversation list */}
      <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)', overflowY: 'auto', padding: 8 }}>
        <button className="btn primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => void newChat()}>
          + New chat
        </button>
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`nav-item${c.id === activeId ? ' active' : ''}`}
            onClick={() => setActiveId(c.id)}
            title={c.title}
          >
            <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.title}
            </span>
          </button>
        ))}
        {conversations.length === 0 && <div className="empty small">No conversations yet.</div>}
      </aside>

      {/* Conversation */}
      <div className="main">
        <div className="page-header">
          <div className="row">
            <span className="page-title">Chat</span>
            {phase && <span className="badge">{phase}…</span>}
          </div>
          <div className="row">
            <select className="select" style={{ width: 'auto' }} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="quick">Quick</option>
              <option value="agent">Agent</option>
              <option value="deep">Deep</option>
            </select>
            <select
              className="select"
              style={{ width: 'auto' }}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && !streamingText && (
            <div className="empty">
              Ask anything. Switch to <strong>Agent</strong> or <strong>Deep</strong> mode for multi-step tool work.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {pendingApproval && (
            <div className="approval-card">
              <div className="row between">
                <strong>Approval required</strong>
                <span className="badge">{pendingApproval.toolId}</span>
              </div>
              <p style={{ margin: '6px 0' }}>{pendingApproval.summary}</p>
              {pendingApproval.resource && (
                <p className="small mono muted" style={{ wordBreak: 'break-all' }}>
                  {pendingApproval.resource}
                </p>
              )}
              {pendingApproval.accountLabel && (
                <p className="small muted">Account: {pendingApproval.accountLabel}</p>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary sm" onClick={() => void decide('approve_once')}>
                  Allow once
                </button>
                <button className="btn sm" onClick={() => void decide('always')}>
                  Always allow
                </button>
                <button className="btn danger sm" onClick={() => void decide('deny')}>
                  Deny
                </button>
              </div>
            </div>
          )}

          {liveActivity && (liveActivity.toolCalls.length > 0 || (liveActivity.plan?.length ?? 0) > 0) && (
            <ActivityView activity={liveActivity} />
          )}

          {streamingText && (
            <div className="msg assistant">
              <div className="who">CloudBrain</div>
              <div className="content">{streamingText}</div>
            </div>
          )}
        </div>

        <div className="composer">
          <div className="composer-inner">
            <textarea
              className="textarea"
              placeholder={mode === 'quick' ? 'Ask something…' : 'Describe a task — the agent will plan and execute…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={sending}
            />
            <button className="btn primary" onClick={() => void send()} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }): React.ReactElement {
  const activity = message.activity;
  return (
    <div className={`msg ${message.role}`}>
      <div className="who">{message.role === 'user' ? 'You' : 'CloudBrain'}</div>
      <div className="content">{message.content}</div>
      {activity && (activity.toolCalls.length > 0 || (activity.plan?.length ?? 0) > 0) && (
        <ActivityView activity={activity} />
      )}
    </div>
  );
}

export function ActivityView({ activity }: { activity: AgentActivity }): React.ReactElement {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button className="btn ghost sm" onClick={() => setOpen(true)} style={{ margin: '4px 0' }}>
        ▸ Show execution activity
      </button>
    );
  }
  return (
    <div className="activity-feed">
      <div className="row between">
        <span className="feed-title">Execution · {activity.mode} mode</span>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      {activity.plan && activity.plan.length > 0 && (
        <ol style={{ margin: '4px 0', paddingLeft: 20 }}>
          {activity.plan.map((s) => (
            <li key={s.id} style={{ color: s.status === 'done' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
              {s.title}
            </li>
          ))}
        </ol>
      )}
      {activity.toolCalls.map((tc, i) => (
        <div key={i} className="small mono" style={{ margin: '2px 0', wordBreak: 'break-all' }}>
          <span data-status={tc.status} style={{ color: 'var(--status-color, inherit)' }}>
            ●
          </span>{' '}
          {tc.toolId}({tc.argsSummary.length > 80 ? `${tc.argsSummary.slice(0, 80)}…` : tc.argsSummary})
          {tc.resultSummary ? ` → ${tc.resultSummary}` : ''}
          {tc.error ? ` ⚠ ${tc.error}` : ''}
        </div>
      ))}
      {activity.integrationActions?.map((ia, i) => (
        <div key={i} className="small" style={{ margin: '2px 0' }}>
          <span data-status={ia.status} style={{ color: 'var(--status-color, inherit)' }}>
            ●
          </span>{' '}
          <strong>{ia.toolkit}</strong> · {ia.action} {ia.status !== 'succeeded' ? `(${ia.status})` : ''}
        </div>
      ))}
    </div>
  );
}
