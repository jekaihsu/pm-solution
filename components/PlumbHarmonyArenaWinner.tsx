"use client";

import React, { useState } from "react";

interface AttachmentItem {
  name: string;
  size: string;
  kind: "pdf" | "cad" | "doc";
}

interface ChatTurn {
  id: string;
  role: "colleague" | "user" | "assistant";
  senderLabel?: string;
  time: string;
  text: string;
}

interface ClientThread {
  id: string;
  clientName: string;
  contactName: string;
  avatarText: string;
  avatarBg: string;
   avatarColor: string;
  caseCode: string;
  shortPreview: string;
  statusLabel: "待確認寄出" | "待補書面確認" | "已寄出";
  timeLabel: string;
  unread: boolean;
  colleagueHandoff: {
    senderLabel: string;
    time: string;
    summaryText: string;
    originalRawMail: string;
  };
  smartReminder: string;
  draft: {
    toName: string;
    toEmail: string;
    subject: string;
    attachments: AttachmentItem[];
    body: string;
    safetyNote: string;
    sent: boolean;
    sentTime?: string;
  };
  extraTurns?: ChatTurn[];
}

const INITIAL_THREADS: ClientThread[] = [
  {
    id: "ctci-cho",
    clientName: "中鼎工程",
    contactName: "卓育賢 工程師",
    avatarText: "中鼎",
    avatarBg: "#eef2ff",
    avatarColor: "#3730a3",
    caseCode: "C115094-4",
    shortPreview: "C115094-4 成果圖資寄送",
    statusLabel: "待確認寄出",
    timeLabel: "剛剛",
    unread: true,
    colleagueHandoff: {
      senderLabel: "恆安（內業同仁）轉來草稿",
      time: "剛剛",
      summaryText:
        "請幫忙把 C115094-4 的測量成果圖資寄給中鼎卓育賢工程師，裡面已經附上技師簽證 PDF 跟 CAD 檔。",
      originalRawMail:
        "寄件人：倢瑛（恆安） <hengan@yongxiang.com.tw>\n內部交代：請幫忙寄給中鼎卓育賢工程師 (Yu-Hsien.Cho@ctci.com)\n案號：C115094-4\n附件：C115094-4_測量成果技師簽證.pdf、C115094-4_成果圖資.dwg\n\n卓工程師您好：\n附上 C115094-4 測量成果圖資一式（含技師簽證 PDF 與 CAD 檔），請查收。",
    },
    smartReminder:
      "已幫你把信件開頭的內部轉寄交代語句自動移除，並確認 2 個成果附件齊全，請確認以下對外草稿：",
    draft: {
      toName: "卓育賢 工程師",
      toEmail: "Yu-Hsien.Cho@ctci.com",
      subject: "C115094-4 測量成果圖資一式",
      attachments: [
        { name: "C115094-4_測量成果技師簽證.pdf", size: "2.4 MB", kind: "pdf" },
        { name: "C115094-4_成果圖資.dwg", size: "5.1 MB", kind: "cad" },
      ],
      body: "卓工程師您好：\n\n附上 C115094-4 測量成果圖資一式（含技師簽證 PDF 與 CAD 檔），請查收。\n若有需要調整或補充之處，請隨時與我們聯繫。\n\n詠祥測量 敬上",
      safetyNote: "✓ 已自動移除內部轉寄語句 · 附件 2 個檔案已齊全",
      sent: false,
    },
  },
  {
    id: "fpg-wang",
    clientName: "台塑石化",
    contactName: "王主辦",
    avatarText: "台塑",
    avatarBg: "#ecfdf5",
    avatarColor: "#065f46",
    caseCode: "C114109",
    shortPreview: "麥寮北側地形測量成果",
    statusLabel: "待確認寄出",
    timeLabel: "10 分鐘前",
    unread: true,
    colleagueHandoff: {
      senderLabel: "恆安（內業同仁）轉來草稿",
      time: "10 分鐘前",
      summaryText:
        "王主辦來信詢問 C114109 麥寮北側地形測量成果，我已經整理好圖資準備回傳給他。",
      originalRawMail:
        "寄件人：恆安 <hengan@yongxiang.com.tw>\n內部交代：請轉寄台塑王主辦 <wang.eng@fpg.com.tw>\n案號：C114109 麥寮北側地形測量\n備註：原本附雲端連結與正式 CAD 檔",
    },
    smartReminder:
      "台塑習慣不收外部雲端連結，已幫你改附 PDF 檔案；另外這案尾款支票還沒兌現，建議先寄 PDF 預覽、暫緩寄出 CAD 原始檔：",
    draft: {
      toName: "台塑石化 王主辦",
      toEmail: "wang.eng@fpg.com.tw",
      subject: "Re: C114109 台塑麥寮北側地形測量成果預覽",
      attachments: [
        { name: "C114109_麥寮北側地形測量成果預覽.pdf", size: "3.8 MB", kind: "pdf" },
      ],
      body: "王主辦您好：\n\n附上 C114109 台塑麥寮北側地形測量成果 PDF 預覽檔供您審閱。\n待款項入帳手續完成後，我們會立即為您寄出正式用印版與 CAD 原始圖檔。\n\n詠祥測量 敬上",
      safetyNote: "✓ 已改為直接附檔（移除外部連結） · 暫緩寄出 CAD 原始檔",
      sent: false,
    },
  },
  {
    id: "aidc-lin",
    clientName: "漢翔航空",
    contactName: "林小姐",
    avatarText: "漢翔",
    avatarBg: "#eff6ff",
    avatarColor: "#1e40af",
    caseCode: "Q115715",
    shortPreview: "報價單 #115715 回傳確認",
    statusLabel: "待確認寄出",
    timeLabel: "28 分鐘前",
    unread: true,
    colleagueHandoff: {
      senderLabel: "業務部轉來草稿",
      time: "28 分鐘前",
      summaryText:
        "漢翔林小姐請我們提供廠區管線地形測量的正式報價單（#115715），已整理好明細請確認寄出。",
      originalRawMail:
        "收件人：漢翔航空 採購部 林小姐 <lin.purchasing@aidc.com.tw>\n主旨：漢翔廠區管線地形測量報價單 (#115715)\n附件：詠祥測量_報價單_115715.pdf",
    },
    smartReminder:
      "已核對報價單項目與過往漢翔同類案件標準一致，並移除內部成本備註，請確認以下回信草稿：",
    draft: {
      toName: "漢翔航空 林小姐",
      toEmail: "lin.purchasing@aidc.com.tw",
      subject: "漢翔廠區管線地形測量報價單（單號 #115715）",
      attachments: [
        { name: "詠祥測量_報價單_115715.pdf", size: "1.1 MB", kind: "pdf" },
      ],
      body: "林小姐您好：\n\n感謝您的來電洽詢。附上本次廠區管線地形測量之正式報價單（單號 #115715）供您參考。\n若對施測範圍或工期安排有任何問題，歡迎隨時告知。\n\n詠祥測量 敬上",
      safetyNote: "✓ 已移除內部成本備註 · 報價單 PDF 已附妥",
      sent: false,
    },
  },
  {
    id: "taipower-chen",
    clientName: "台電海域風電",
    contactName: "陳主辦",
    avatarText: "台電",
    avatarBg: "#fef3c7",
    avatarColor: "#92400e",
    caseCode: "C115081",
    shortPreview: "北側加測 200m 電話口頭承諾",
    statusLabel: "待補書面確認",
    timeLabel: "1 小時前",
    unread: false,
    colleagueHandoff: {
      senderLabel: "電話聯繫紀錄",
      time: "1 小時前",
      summaryText:
        "剛剛跟台電陳主辦通完電話，口頭答應下週三前幫他們補測北側 200m 斷面圖，需要補一封書面確認信給雙方留底。",
      originalRawMail:
        "通話對象：台電海域風電施工處 陳主辦 <chen.wind@taipower.com.tw>\n通話摘要：業主反映北側防風林交界處需往外延伸 200m 補測斷面，已口頭答應於下週三（11/4）前補交圖資。",
    },
    smartReminder:
      "剛剛電話裡口頭答應北側加測 200m，已幫你寫進確認信草稿，寄出後能讓雙方都有清楚的書面紀錄：",
    draft: {
      toName: "台電海域風電 陳主辦",
      toEmail: "chen.wind@taipower.com.tw",
      subject: "C115081 北側延伸 200m 斷面補測與交期確認",
      attachments: [
        { name: "C115081_北側加測200m範圍示意圖.pdf", size: "1.6 MB", kind: "pdf" },
      ],
      body: "陳主辦您好：\n\n依今日電話討論內容，本案（C115081）北側防風林交界處將協助往外延伸 200m 進行斷面補測，預計於下週三前完成並提交更新圖資。\n特此來信與您書面確認，謝謝。\n\n詠祥測量 敬上",
      safetyNote: "✓ 已將電話口頭承諾轉為書面條款 · 附範圍示意圖",
      sent: false,
    },
  },
  {
    id: "tongxiao-shuai",
    clientName: "通霄電廠",
    contactName: "帥玉康 監工",
    avatarText: "通霄",
    avatarBg: "#f3e8ff",
    avatarColor: "#6b21a8",
    caseCode: "C115102",
    shortPreview: "出入廠憑單申請附件",
    statusLabel: "待確認寄出",
    timeLabel: "昨天",
    unread: false,
    colleagueHandoff: {
      senderLabel: "行政部轉來草稿",
      time: "昨天",
      summaryText:
        "下週二外業人員要進通霄電廠施測，出入廠憑單與 4 位人員團保證明已經備齊，請確認寄給帥玉康監工。",
      originalRawMail:
        "收件人：通霄電廠 帥玉康監工 <yk.shuai@taipower.com.tw>\n主旨：C115102 詠祥測量進場人員出入廠憑單與保險名冊\n附件：出入廠憑單申請表.pdf、外業人員團保證明.pdf",
    },
    smartReminder:
      "已確認下週二進場的 4 位外業人員保險證明與出入廠憑單皆在有效期限內，請確認以下草稿：",
    draft: {
      toName: "通霄電廠 帥玉康 監工",
      toEmail: "yk.shuai@taipower.com.tw",
      subject: "C115102 詠祥測量下週二進場出入廠憑單與保險證明",
      attachments: [
        { name: "通霄電廠_出入廠憑單申請表.pdf", size: "0.9 MB", kind: "pdf" },
        { name: "外業施測人員團保證明.pdf", size: "1.4 MB", kind: "pdf" },
      ],
      body: "帥監工您好：\n\n附上本案（C115102）下週二預計進場施測之 4 位人員出入廠憑單申請表與團保證明文件，請惠予協助辦理進場手續。\n\n詠祥測量 敬上",
      safetyNote: "✓ 4 位進場人員證件與保險附件已齊全",
      sent: false,
    },
  },
  {
    id: "cec-wu",
    clientName: "大陸工程",
    contactName: "吳主任",
    avatarText: "大陸",
    avatarBg: "#f4f4f5",
    avatarColor: "#3f3f46",
    caseCode: "C115062",
    shortPreview: "C115062 期中請款入帳核對",
    statusLabel: "已寄出",
    timeLabel: "週五",
    unread: false,
    colleagueHandoff: {
      senderLabel: "財務部通知",
      time: "週五 15:20",
      summaryText:
        "大陸工程 C115062 期中請款已經入帳兌現，正式用印成果圖與 CAD 檔已寄給吳主任。",
      originalRawMail:
        "收件人：大陸工程 吳主任 <wu.dir@continental-engineering.com>\n主旨：C115062 正式用印測量成果圖資與 CAD 原始檔",
    },
    smartReminder: "這封信已於週五下午確認並寄出，對方已收件。",
    draft: {
      toName: "大陸工程 吳主任",
      toEmail: "wu.dir@continental-engineering.com",
      subject: "C115062 正式用印測量成果圖資與 CAD 原始檔",
      attachments: [
        { name: "C115062_正式用印成果圖.pdf", size: "4.2 MB", kind: "pdf" },
        { name: "C115062_完整測量圖資.dwg", size: "6.8 MB", kind: "cad" },
      ],
      body: "吳主任您好：\n\n感謝貴司協助辦理期中款項。附上 C115062 正式用印測量成果圖 PDF 與 CAD 原始檔一式，請查收。\n\n詠祥測量 敬上",
      safetyNote: "✓ 款項已兌現 · 正式圖資已於週五 15:42 寄出",
      sent: true,
      sentTime: "週五 15:42",
    },
  },
];

const QUICK_PROMPTS = [
  "剛通完電話，記一下口頭答應的事",
  "語氣改客氣一點",
  "加上下週三前交件",
];

export default function PlumbHarmonyArenaWinner() {
  const [threads, setThreads] = useState<ClientThread[]>(INITIAL_THREADS);
  const [activeId, setActiveId] = useState<string>("ctci-cho");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editingDraft, setEditingDraft] = useState<boolean>(false);
  const [editedBody, setEditedBody] = useState<string>("");
  const [editedSubject, setEditedSubject] = useState<string>("");
  const [chatInput, setChatInput] = useState<string>("");
  const [showRawDrawer, setShowRawDrawer] = useState<boolean>(false);
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>("");
  const [newInstruction, setNewInstruction] = useState<string>("");

  const activeThread =
    threads.find((t) => t.id === activeId) || threads[0];

  const filteredThreads = threads.filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      t.clientName.toLowerCase().includes(q) ||
      t.contactName.toLowerCase().includes(q) ||
      t.caseCode.toLowerCase().includes(q) ||
      t.shortPreview.toLowerCase().includes(q)
    );
  });

  const handleSelectThread = (id: string) => {
    setActiveId(id);
    setEditingDraft(false);
    setShowRawDrawer(false);
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, unread: false } : t))
    );
  };

  const handleStartEdit = () => {
    setEditedSubject(activeThread.draft.subject);
    setEditedBody(activeThread.draft.body);
    setEditingDraft(true);
  };

  const handleSaveEdit = () => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              draft: {
                ...t.draft,
                subject: editedSubject,
                body: editedBody,
              },
            }
          : t
      )
    );
    setEditingDraft(false);
  };

  const handleSendDraft = () => {
    const nowStr = new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              statusLabel: "已寄出",
              unread: false,
              draft: {
                ...t.draft,
                body: editingDraft ? editedBody : t.draft.body,
                subject: editingDraft ? editedSubject : t.draft.subject,
                sent: true,
                sentTime: `今日 ${nowStr}`,
              },
            }
          : t
      )
    );
    setEditingDraft(false);
  };

  const applyInstruction = (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    const nowStr = new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    });

    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== activeThread.id) return t;

        let updatedBody = t.draft.body;
        let updatedNote = t.draft.safetyNote;
        let assistantReply = "已根據你的指示更新對外信件草稿，請過目：";

        if (text.includes("客氣")) {
          updatedBody = t.draft.body.replace(
            "請查收。",
            "敬請撥冗查收，感謝您一直以來的支持與協助。"
          );
          assistantReply = "已幫你把信件語氣調整得更溫和客氣，請確認下方草稿：";
        } else if (text.includes("下週三")) {
          if (!updatedBody.includes("下週三前")) {
            updatedBody = updatedBody.replace(
              "\n\n詠祥測量 敬上",
              "\n補充說明：相關補充圖資我們將於下週三前準時交付予貴司。\n\n詠祥測量 敬上"
            );
          }
          updatedNote = "✓ 已寫入「下週三前交件」承諾 · 附件齊全";
          assistantReply = "已在信件正文加上「下週三前交件」的書面說明，請確認：";
        } else if (text.includes("電話") || text.includes("口頭")) {
          if (!updatedBody.includes("今日電話")) {
            updatedBody = updatedBody.replace(
              "\n\n詠祥測量 敬上",
              "\n此外，依今日電話討論共識，北側加測部分我們將於下週三前一併整理提供，特此書面確認。\n\n詠祥測量 敬上"
            );
          }
          updatedNote = "✓ 已把電話口頭承諾寫入確認信草稿";
          assistantReply =
            "已幫你把剛剛電話裡口頭答應的事項寫進確認信草稿，避免日後口說無憑：";
        } else {
          updatedBody = `${t.draft.body.replace(
            "\n\n詠祥測量 敬上",
            ""
          )}\n\n補充說明：${text}\n\n詠祥測量 敬上`;
        }

        const newTurns: ChatTurn[] = [
          ...(t.extraTurns || []),
          {
            id: `u-${Date.now()}`,
            role: "user",
            time: nowStr,
            text,
          },
          {
            id: `a-${Date.now() + 1}`,
            role: "assistant",
            time: nowStr,
            text: assistantReply,
          },
        ];

        return {
          ...t,
          statusLabel: "待確認寄出",
          draft: {
            ...t.draft,
            body: updatedBody,
            safetyNote: updatedNote,
            sent: false,
          },
          extraTurns: newTurns,
        };
      })
    );

    setChatInput("");
  };

  const handleCreateNewThread = () => {
    if (!newClientName.trim() && !newInstruction.trim()) {
      setShowNewModal(false);
      return;
    }
    const clientTitle = newClientName.trim() || "新業主聯繫";
    const instructionText =
      newInstruction.trim() ||
      "剛跟業主通完電話，請幫我擬一封測量成果與交期確認信。";
    const id = `thread-${Date.now()}`;
    const newThread: ClientThread = {
      id,
      clientName: clientTitle,
      contactName: "專案窗口",
      avatarText: clientTitle.slice(0, 2),
      avatarBg: "#eef2ff",
      avatarColor: "#3730a3",
      caseCode: "新聯繫",
      shortPreview: instructionText.slice(0, 18),
      statusLabel: "待確認寄出",
      timeLabel: "剛剛",
      unread: false,
      colleagueHandoff: {
        senderLabel: "你剛剛交代的事項",
        time: "剛剛",
        summaryText: instructionText,
        originalRawMail: instructionText,
      },
      smartReminder: "已根據你的口頭交代整理好對外確認信草稿，請確認：",
      draft: {
        toName: `${clientTitle} 專案窗口`,
        toEmail: "contact@client.com.tw",
        subject: `${clientTitle} 測量作業與交期確認`,
        attachments: [],
        body: `您好：\n\n依剛剛聯繫內容，整理本次測量作業事項如下：\n${instructionText}\n\n若有需調整之處請隨時告知。\n\n詠祥測量 敬上`,
        safetyNote: "✓ 已根據你的交代自動產生對外草稿",
        sent: false,
      },
    };
    setThreads((prev) => [newThread, ...prev]);
    setActiveId(id);
    setNewClientName("");
    setNewInstruction("");
    setShowNewModal(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        width: "100vw",
        height: "100vh",
        background: "#ffffff",
        color: "#18181b",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
        overflow: "hidden",
      }}
    >
      {/* Left Sidebar: Pure Grok-Bot-style conversation list */}
      <aside
        style={{
          width: "280px",
          minWidth: "280px",
          height: "100%",
          background: "#f9f9f8",
          borderRight: "1px solid #e6e6e3",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top Brand & New Button */}
        <div
          style={{
            padding: "18px 16px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "8px",
                background: "#18181b",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              永
            </div>
            <span
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#18181b",
                letterSpacing: "-0.01em",
              }}
            >
              永祥 · 業主聯繫
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            style={{
              padding: "5px 11px",
              borderRadius: "999px",
              background: "#ffffff",
              border: "1px solid #dcdcd8",
              color: "#27272a",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + 新聯繫
          </button>
        </div>

        {/* Search Input */}
        <div style={{ padding: "0 14px 12px" }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋業主、聯絡人或案號…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 12px",
              borderRadius: "10px",
              border: "1px solid #e4e4e1",
              background: "#ffffff",
              fontSize: "13px",
              color: "#18181b",
              outline: "none",
            }}
          />
        </div>

        {/* Thread List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 8px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {filteredThreads.map((item) => {
            const isSelected = item.id === activeThread.id;
            const isDone = item.draft.sent || item.statusLabel === "已寄出";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectThread(item.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "11px 12px",
                  borderRadius: "12px",
                  border: "none",
                  background: isSelected ? "#ecece9" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  transition: "background 0.12s ease",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    minWidth: "36px",
                    borderRadius: "999px",
                    background: item.avatarBg,
                    color: item.avatarColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    marginTop: "1px",
                  }}
                >
                  {item.avatarText}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "4px",
                      marginBottom: "3px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13.5px",
                        fontWeight: isSelected || item.unread ? 700 : 600,
                        color: "#18181b",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.clientName} · {item.contactName.replace(" 工程師", "").replace(" 監工", "")}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#71717a",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.timeLabel}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "12.5px",
                      color: "#52525b",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginBottom: "4px",
                    }}
                  >
                    {item.shortPreview}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "999px",
                        background: isDone
                          ? "#10b981"
                          : item.statusLabel === "待補書面確認"
                          ? "#f59e0b"
                          : "#2563eb",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11.5px",
                        color: isDone ? "#059669" : "#52525b",
                        fontWeight: isDone ? 500 : 600,
                      }}
                    >
                      {isDone ? "已寄出" : item.statusLabel}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Center Main Area: Pure White, Centered Conversation + Single Clean Draft Card */}
      <main
        style={{
          flex: 1,
          height: "100%",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* Minimal Top Header */}
        <header
          style={{
            height: "60px",
            minHeight: "60px",
            borderBottom: "1px solid #f1f1ef",
            padding: "0 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#18181b",
              }}
            >
              {activeThread.clientName} · {activeThread.contactName}
            </span>
            <span
              style={{
                padding: "2px 9px",
                borderRadius: "999px",
                background: "#f4f4f5",
                color: "#52525b",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {activeThread.caseCode}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowRawDrawer(!showRawDrawer)}
            style={{
              padding: "6px 12px",
              borderRadius: "999px",
              background: showRawDrawer ? "#18181b" : "#ffffff",
              color: showRawDrawer ? "#ffffff" : "#52525b",
              border: "1px solid #e4e4e7",
              fontSize: "12.5px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {showRawDrawer ? "關閉原始信件" : "查看原始信件 / 附件"}
          </button>
        </header>

        {/* Scrollable Centered Conversation Stream */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "32px 24px 24px",
          }}
        >
          <div
            style={{
              maxWidth: "740px",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: "22px",
            }}
          >
            {/* ① Colleague Handoff / Incoming Email Summary Bubble */}
            <div
              style={{
                alignSelf: "flex-start",
                maxWidth: "88%",
                background: "#f4f4f5",
                borderRadius: "18px",
                padding: "14px 18px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#71717a",
                  marginBottom: "6px",
                }}
              >
                {activeThread.colleagueHandoff.senderLabel} ·{" "}
                {activeThread.colleagueHandoff.time}
              </div>
              <div
                style={{
                  fontSize: "15px",
                  lineHeight: 1.65,
                  color: "#18181b",
                }}
              >
                {activeThread.colleagueHandoff.summaryText}
              </div>
            </div>

            {/* ② Assistant's 1-sentence plain-language smart reminder */}
            <div
              style={{
                fontSize: "15px",
                lineHeight: 1.65,
                color: "#27272a",
                padding: "0 4px",
              }}
            >
              {activeThread.smartReminder}
            </div>

            {/* Extra user/assistant turns if JK typed instructions */}
            {(activeThread.extraTurns || []).map((turn) =>
              turn.role === "user" ? (
                <div
                  key={turn.id}
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "80%",
                    background: "#18181b",
                    color: "#ffffff",
                    borderRadius: "18px",
                    padding: "12px 18px",
                    fontSize: "15px",
                    lineHeight: 1.6,
                  }}
                >
                  {turn.text}
                </div>
              ) : (
                <div
                  key={turn.id}
                  style={{
                    fontSize: "15px",
                    lineHeight: 1.65,
                    color: "#27272a",
                    padding: "0 4px",
                  }}
                >
                  {turn.text}
                </div>
              )
            )}

            {/* ③ Single Clean Draft Confirmation Card ("對外信件草稿") */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e4e4e7",
                borderRadius: "16px",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
                overflow: "hidden",
              }}
            >
              {/* Card Header */}
              <div
                style={{
                  padding: "14px 22px",
                  background: "#fafafa",
                  borderBottom: "1px solid #f1f1f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#18181b",
                    }}
                  >
                    對外信件草稿
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: "999px",
                    background: activeThread.draft.sent
                      ? "#ecfdf5"
                      : "#eff6ff",
                    color: activeThread.draft.sent ? "#047857" : "#1d4ed8",
                  }}
                >
                  {activeThread.draft.sent
                    ? `✓ 已寄出（${activeThread.draft.sentTime || "剛剛"}）`
                    : "待你確認"}
                </span>
              </div>

              {/* Recipient, Subject, Attachments */}
              <div
                style={{
                  padding: "16px 22px 12px",
                  borderBottom: "1px solid #f4f4f5",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  fontSize: "14px",
                }}
              >
                <div style={{ display: "flex", gap: "12px" }}>
                  <span
                    style={{
                      width: "52px",
                      color: "#71717a",
                      fontWeight: 500,
                    }}
                  >
                    收件人
                  </span>
                  <span style={{ color: "#18181b", fontWeight: 600 }}>
                    {activeThread.draft.toName}{" "}
                    <span style={{ color: "#71717a", fontWeight: 400 }}>
                      &lt;{activeThread.draft.toEmail}&gt;
                    </span>
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      width: "52px",
                      color: "#71717a",
                      fontWeight: 500,
                    }}
                  >
                    主旨
                  </span>
                  {editingDraft ? (
                    <input
                      type="text"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        borderRadius: "8px",
                        border: "1px solid #d4d4d8",
                        fontSize: "14px",
                        color: "#18181b",
                      }}
                    />
                  ) : (
                    <span style={{ color: "#18181b", fontWeight: 600 }}>
                      {activeThread.draft.subject}
                    </span>
                  )}
                </div>

                {activeThread.draft.attachments.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        width: "52px",
                        color: "#71717a",
                        fontWeight: 500,
                        paddingTop: "4px",
                      }}
                    >
                      附件
                    </span>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        flex: 1,
                      }}
                    >
                      {activeThread.draft.attachments.map((att, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            background: "#f4f4f5",
                            color: "#27272a",
                            fontSize: "13px",
                          }}
                        >
                          <span>
                            {att.kind === "pdf" ? "📄" : "📐"} {att.name}
                          </span>
                          <span style={{ color: "#71717a", fontSize: "12px" }}>
                            ({att.size})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Email Body */}
              <div style={{ padding: "18px 22px" }}>
                {editingDraft ? (
                  <textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    rows={7}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "12px",
                      borderRadius: "10px",
                      border: "1px solid #d4d4d8",
                      fontSize: "15px",
                      lineHeight: 1.75,
                      color: "#18181b",
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: "15.5px",
                      lineHeight: 1.8,
                      color: "#18181b",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {activeThread.draft.body}
                  </div>
                )}
              </div>

              {/* Card Footer: 1-line human note + ONLY 2 clean buttons */}
              <div
                style={{
                  padding: "14px 22px",
                  background: "#fafafa",
                  borderTop: "1px solid #f1f1f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    color: "#059669",
                    fontWeight: 500,
                  }}
                >
                  {activeThread.draft.safetyNote}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {editingDraft ? (
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "999px",
                        background: "#ffffff",
                        border: "1px solid #d4d4d8",
                        color: "#18181b",
                        fontSize: "13.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      完成修改
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "999px",
                        background: "#ffffff",
                        border: "1px solid #d4d4d8",
                        color: "#27272a",
                        fontSize: "13.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      修改內容
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSendDraft}
                    disabled={activeThread.draft.sent}
                    style={{
                      padding: "8px 20px",
                      borderRadius: "999px",
                      background: activeThread.draft.sent
                        ? "#10b981"
                        : "#18181b",
                      border: "none",
                      color: "#ffffff",
                      fontSize: "13.5px",
                      fontWeight: 600,
                      cursor: activeThread.draft.sent ? "default" : "pointer",
                    }}
                  >
                    {activeThread.draft.sent ? "已確認寄出" : "確認並寄出"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ④ Bottom Grok-Bot-style Natural Language Input Bar */}
        <div
          style={{
            padding: "8px 24px 22px",
            background: "#ffffff",
          }}
        >
          <div style={{ maxWidth: "740px", margin: "0 auto" }}>
            {/* Quick Suggestion Chips */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              {QUICK_PROMPTS.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => applyInstruction(phrase)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "999px",
                    background: "#f4f4f5",
                    border: "1px solid #e4e4e7",
                    color: "#3f3f46",
                    fontSize: "12.5px",
                    cursor: "pointer",
                  }}
                >
                  「{phrase}」
                </button>
              ))}
            </div>

            {/* Grok-style Pill Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyInstruction(chatInput);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "#f4f4f5",
                border: "1px solid #e4e4e7",
                borderRadius: "24px",
                padding: "10px 14px 10px 18px",
              }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="直接打字或語音交代，例如：「剛跟卓工程師通完電話，答應下週三前補北側 200m 斷面圖」…"
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  fontSize: "14.5px",
                  color: "#18181b",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                style={{
                  width: "34px",
                  height: "34px",
                  minWidth: "34px",
                  borderRadius: "999px",
                  border: "none",
                  background: chatInput.trim() ? "#18181b" : "#d4d4d8",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: chatInput.trim() ? "pointer" : "default",
                  fontSize: "15px",
                  fontWeight: 700,
                }}
                title="送出指示"
              >
                ↑
              </button>
            </form>
          </div>
        </div>

        {/* Optional Slide-over Drawer for Original Mail (Closed by Default) */}
        {showRawDrawer && (
          <div
            style={{
              position: "absolute",
              top: "60px",
              right: 0,
              bottom: 0,
              width: "360px",
              background: "#fafafa",
              borderLeft: "1px solid #e4e4e7",
              padding: "20px",
              overflowY: "auto",
              boxShadow: "-4px 0 16px rgba(0,0,0,0.04)",
              zIndex: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "14px",
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#18181b" }}>
                同仁轉來原始內容與附件
              </span>
              <button
                type="button"
                onClick={() => setShowRawDrawer(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#71717a",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e4e4e7",
                borderRadius: "12px",
                padding: "14px",
                fontSize: "13.5px",
                lineHeight: 1.7,
                color: "#3f3f46",
                whiteSpace: "pre-wrap",
              }}
            >
              {activeThread.colleagueHandoff.originalRawMail}
            </div>
          </div>
        )}

        {/* Optional Modal for "+ 新聯繫" */}
        {showNewModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100000,
            }}
          >
            <div
              style={{
                width: "440px",
                background: "#ffffff",
                borderRadius: "16px",
                padding: "24px",
                boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  marginBottom: "16px",
                  color: "#18181b",
                }}
              >
                新增業主聯繫草稿
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    color: "#52525b",
                    marginBottom: "6px",
                  }}
                >
                  業主與聯絡人
                </label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="例如：中鼎工程 · 卓育賢"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "9px 12px",
                    borderRadius: "10px",
                    border: "1px solid #d4d4d8",
                    fontSize: "14px",
                  }}
                />
              </div>
              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    color: "#52525b",
                    marginBottom: "6px",
                  }}
                >
                  要交代給業主的內容
                </label>
                <textarea
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  rows={4}
                  placeholder="直接輸入口頭承諾、報價確認或要寄送的圖資說明…"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "9px 12px",
                    borderRadius: "10px",
                    border: "1px solid #d4d4d8",
                    fontSize: "14px",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "999px",
                    border: "1px solid #d4d4d8",
                    background: "#ffffff",
                    fontSize: "13.5px",
                    cursor: "pointer",
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreateNewThread}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "999px",
                    border: "none",
                    background: "#18181b",
                    color: "#ffffff",
                    fontSize: "13.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  產生草稿
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
