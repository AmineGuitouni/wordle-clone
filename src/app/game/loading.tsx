import { Spinner } from "@nextui-org/react";

export default function Loading() {

    return (
        <div className="h-[calc(100vh-6rem)] flex justify-center items-center">
            <Spinner color="primary" size="lg"/>
        </div>
    )
}