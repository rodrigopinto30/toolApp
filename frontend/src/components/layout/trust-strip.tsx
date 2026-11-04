import { BanknoteIcon, StoreIcon, TruckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

const ITEMS = [
  { key: "shipping", Icon: TruckIcon },
  { key: "pickup", Icon: StoreIcon },
  { key: "currency", Icon: BanknoteIcon },
] as const;

export function TrustStrip() {
  const t = useTranslations("TrustStrip");

  return (
    <div className="border-b bg-card text-card-foreground">
      <ul className="mx-auto grid w-full max-w-5xl grid-cols-3 gap-2 px-4 py-2 text-xs leading-tight font-medium sm:flex sm:justify-between sm:text-sm">
        {ITEMS.map(({ key, Icon }) => (
          <li key={key} className="flex flex-col items-center gap-1 text-center sm:flex-row sm:gap-2 sm:text-left">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground sm:size-7">
              <Icon aria-hidden="true" className="size-3.5 sm:size-4" />
            </span>
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}
