import en from "../../messages/en.json";
import es from "../../messages/es.json";

export const messages = { es, en };

export type Locale = keyof typeof messages;
export type Messages = (typeof messages)[Locale];
