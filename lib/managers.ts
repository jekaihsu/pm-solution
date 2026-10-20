// 各類別的負責經理（業主 2026-10-14）：外業→吳科翰、業務→涂正邦、內業→張佳斌。
// 異常與人工確認清單顯示負責經理，方便指派追蹤。純資料，無相依。
export const MANAGERS = {
  外業: "吳科翰",
  業務: "涂正邦",
  內業: "張佳斌",
} as const;

export type ManagerArea = keyof typeof MANAGERS;
export const managerOf = (area: ManagerArea): string => MANAGERS[area];
