import { createContext, useContext, useState, useEffect } from "react";
import { en, type TKeys } from "@/lib/i18n/en";
import { id } from "@/lib/i18n/id";

type Language = "en" | "id";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TKeys, ...args: any[]) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "tandatanganin_lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "id" ? "id" : "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  const translations = language === "id" ? id : en;

  const t = (key: TKeys, ...args: any[]): string => {
    const val = translations[key] ?? en[key];
    if (typeof val === "function") return (val as (...a: any[]) => string)(...args);
    return (val as string) ?? String(key);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
