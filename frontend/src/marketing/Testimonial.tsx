import { usd } from "../lib/format";
import { Art } from "../ui/Art";
import { Container } from "../ui/Container";
import { TESTIMONIAL as t } from "./content";

export function Testimonial() {
  return (
    <section className="py-24 lg:py-40">
      <Container className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
        <Art src="/img/testimonial-carpenter.webp" alt="A carpenter planing wood at his workbench" ratio="3/4" blend parallax={0.85} className="w-full max-w-[460px] lg:col-span-5" />
        <figure className="lg:col-span-6 lg:col-start-7">
          <blockquote className="text-h2">
            <p>“{t.quote}”</p>
          </blockquote>
          <figcaption className="mt-8 flex flex-col gap-1">
            <span className="text-body font-medium">{t.name}</span>
            <span className="tabular text-small text-ink-2">{t.business} · {t.city} · borrowed {usd(t.amount)}</span>
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}
