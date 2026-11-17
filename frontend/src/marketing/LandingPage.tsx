import { Footer } from "../ui/Footer";
import { Nav } from "../ui/Nav";
import { Calculator } from "./Calculator";
import { FinalCta } from "./FinalCta";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Testimonial } from "./Testimonial";
import { Trust } from "./Trust";
import { WhoBorrows } from "./WhoBorrows";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <WhoBorrows />
        <HowItWorks />
        <Calculator />
        <Trust />
        <Testimonial />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
