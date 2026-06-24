import NotesClient from "./NotesClient";

// NotesClient is a client component, but it only touches the Web Speech API /
// `window` inside effects, so it server-renders safely without `ssr: false`.
export default function Page() {
  return <NotesClient />;
}
