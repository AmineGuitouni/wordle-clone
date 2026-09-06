"use client"
import { Button } from "@heroui/react"
import {signOut} from "next-auth/react"
import { CiLogout } from "react-icons/ci";

export default function SigneOut() {

    return (
        <Button
            onClick={() => signOut()}
            color="danger"
            variant="bordered"
            size="md"
        >
            <CiLogout/> Sign Out
        </Button>
    )
}
