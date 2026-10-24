// 「預排核對報告」Lark Docx 的單一設定來源。
// 這份雲端 Docx 由 scripts/yupai-report 產生器覆寫（見 docs/YUPAI_REPORT.md）；
// 儀表板只提供連結，不讀取、不寫入它。
//
// 網址可用環境變數覆寫（NEXT_PUBLIC_ 前綴，client/server 皆可讀）；未設定時用預設。
// 文件 token（docId）固定，供產生器 `--doc-id` 覆寫同一份文件用。

export const YUPAI_REPORT_DOC_ID = "VCAgdgGFooejQ9xqiHZjaCGhpIe";

export const YUPAI_REPORT_URL =
  process.env.NEXT_PUBLIC_YUPAI_REPORT_URL ||
  `https://yong-xiang-survey.jp.larksuite.com/docx/${YUPAI_REPORT_DOC_ID}`;

export const YUPAI_REPORT_TITLE = "預排核對報告";
