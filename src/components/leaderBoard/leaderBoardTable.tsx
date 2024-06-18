"use client"
import {Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, User} from "@nextui-org/react";

export default function ScoresTable({ Data }:{
    Data:{
        user:{
            name:string,
            email:string
            image?:string
        },
        tries:number,
        time:number //in micros seconds
    }[]
}) {
  return (
    <Table aria-label="Example static collection table">
      <TableHeader>
        <TableColumn>Top</TableColumn>
        <TableColumn>User</TableColumn>
        <TableColumn>Tries</TableColumn>
        <TableColumn>Time</TableColumn>
        <TableColumn>Score</TableColumn>
      </TableHeader>
      <TableBody>
        {Data.map((item, index) => (
            <TableRow key={index}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                <User   
                    name={item.user.name}
                    description={item.user.email}
                    avatarProps={{
                        src: item.user.image,
                    }}
                />
                </TableCell>
                <TableCell>{item.tries}</TableCell>
                <TableCell>{`${item.time}ms`}</TableCell>
                <TableCell>{Math.floor(1000000000/(item.time + (10000 * item.tries)))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
