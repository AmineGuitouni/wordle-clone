"use client"
import { SessionProvider } from "next-auth/react"
import { useEffect } from "react";

export default function AppSession({
    children,
    session,
  }:any){  

    return(
        <SessionProvider session={session}>
            {children}
        </SessionProvider>
    )
}