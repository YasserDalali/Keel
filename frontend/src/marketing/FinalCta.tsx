import { Button } from "../ui/Button";
import { Container } from "../ui/Container";

export function FinalCta() {
  return (
    <section className="pb-24 lg:pb-32">
      <Container className="flex flex-col items-start gap-8 border-t border-line pt-16 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="text-h1 max-w-[14ch]">Ready when your next order is.</h2>
        <div className="flex flex-col gap-4 lg:items-end">
          <Button size="lg" to="/signup">Create your account</Button>
          <p className="text-small text-ink-2">Takes about ten minutes. You'll need an ID and online banking.</p>
        </div>
      </Container>
    </section>
  );
}
