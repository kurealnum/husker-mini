import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Husker Mini
      </h1>
      <p className="text-muted-foreground">
        Kalshi sports event prediction system.
      </p>
      <Link href="/predictions" className={buttonVariants({ className: "w-fit" })}>
        View predictions
      </Link>
    </div>
  );
}
