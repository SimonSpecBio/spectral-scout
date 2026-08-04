"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type MapEditorType from "./MapEditor";

// react-konva pulls in konva's Node build, which tries to require("canvas")
// for SSR -- a native binary dep we don't want. ssr:false keeps it entirely
// client-side (it's a <canvas>-based editor, there's nothing to render on
// the server anyway), and that option only works from a Client Component,
// hence this thin wrapper around the actual MapEditor.
const MapEditor = dynamic(() => import("./MapEditor"), { ssr: false });

export default function MapEditorClient(props: ComponentProps<typeof MapEditorType>) {
  return <MapEditor {...props} />;
}
