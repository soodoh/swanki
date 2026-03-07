import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
});

function Home(): React.ReactElement {
  return (
    <div>
      <h1>Hello, Swanki</h1>
    </div>
  );
}
