"use server";

import { auth } from "@/auth";
import { WordsList } from "./constants";
import { getDb, type HistoryDocument, type WordDocument } from "./mongodb";

export async function CheckWord({ word }: { word: string }) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("No session found");
  }

  if (!WordsList.includes(word.toLowerCase())) {
    throw new Error("Word not found");
  }

  const db = await getDb();
  const words = db.collection<WordDocument>("words");
  const historyCollection = db.collection<HistoryDocument>("users-history");

  const todayDocument = await words.findOne({}, { sort: { createdAt: -1 } });
  if (!todayDocument) {
    throw new Error("No word found");
  }

  const toDaysWord = todayDocument.word;
  let history = await historyCollection.findOne(
    { userId: session.user.id },
    { sort: { createdAt: -1 } },
  );

  if (!history || history.toDaysWord !== toDaysWord) {
    const newHistory: HistoryDocument = {
      userId: session.user.id,
      toDaysWord,
      words: [],
      colors: [],
      letters: [],
      createdAt: new Date(),
      finishedAt: null,
    };
    const result = await historyCollection.insertOne(newHistory);
    history = { ...newHistory, _id: result.insertedId };
  }

  if (history.words.at(-1) === toDaysWord) {
    throw new Error("Already guessed");
  }

  const userGuess = word;
  const win = toDaysWord.toUpperCase() === word;

  if (win) {
    const colors = ["G", "G", "G", "G", "G"];
    await historyCollection.updateOne(
      { _id: history._id },
      {
        $set: {
          words: [...history.words, word],
          colors: [...history.colors, colors.join("-")],
          finishedAt: new Date(),
        },
      },
    );

    return { colors, win, letters: [] };
  }

  const colors = ["R", "R", "R", "R", "R"];
  const letters: HistoryDocument["letters"] = [];
  let randomWord = toDaysWord.toUpperCase();

  for (let i = 0; i < 5; i++) {
    if (word[i] === randomWord[i]) {
      letters.push({ letter: word[i], type: "right" });
      colors[i] = "G";
      randomWord = `${randomWord.slice(0, i)}_${randomWord.slice(i + 1)}`;
      word = `${word.slice(0, i)}_${word.slice(i + 1)}`;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (word[i] !== "_" && randomWord.slice(i).includes(word[i])) {
      letters.push({ letter: word[i], type: "missPlaced" });
      colors[i] = "Y";
      randomWord = randomWord.replace(word[i], "_");
      word = word.replace(word[i], "_");
    } else if (word[i] !== "_" && !toDaysWord.includes(word[i])) {
      letters.push({ letter: word[i], type: "wrong" });
    }
  }

  await historyCollection.updateOne(
    { _id: history._id },
    {
      $set: {
        words: [...history.words, userGuess],
        colors: [...history.colors, colors.join("-")],
        letters: [...history.letters, ...letters],
      },
    },
  );

  return { colors, win, letters };
}
