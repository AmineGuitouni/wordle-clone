import LoginWithGoogleBtn from "@/components/authantication/loginWithGoogleBtn";
import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";
import NextImage from "next/image";
import GuessTheGameImage from "../../public/6228c9669da9446176b9f711.png"

export default async function Home() {
  const session = await getServerSession(authOptions)

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
      <LoginWithGoogleBtn text="play" color="secondary" className="px-12 text-xl font-semibold py-6"/>
    </div>
  );
}
