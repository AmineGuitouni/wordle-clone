import GuestLoginForm from "@/components/authantication/guestLoginForm";
import { auth } from "@/auth";
import NextImage from "next/image";
import GuessTheGameImage from "../../public/6228c9669da9446176b9f711.png"
 
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth()

  return (
    <div className="container mx-auto h-full flex-grow flex flex-col justify-center items-center gap-4">
      <NextImage
        className="w-[300px] h-[150px] object-cover"
        src={GuessTheGameImage}
        alt="image"
        width={300}
        height={150}
      />
      <p className="text-3xl font-bold w-[400px] text-center">Get 6 chances to guess a 5 letter word.</p>
      <GuestLoginForm buttonText="Play" color="secondary" />
    </div>
  );
}
