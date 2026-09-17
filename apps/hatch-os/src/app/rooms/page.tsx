"use client";

import { useRouter } from "next/navigation";
import { useHatch } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";

export default function RoomsPage() {
  const {
    visibleRooms,
    currentRoomId,
    currentRoom,
    threads,
    setRoom,
    emptyRoomsDemo,
    setEmptyRoomsDemo,
  } = useHatch();
  const router = useRouter();

  if (emptyRoomsDemo) {
    return (
      <Shell>
        <div className="panel">
          <p className="screen-kicker">Rooms</p>
          <h1>No rooms.</h1>
          <p className="lede">
            Admin creates Fund A / Fund B (or the first matter). There is no cross-room “search
            everything” in this beta.
          </p>
          <button className="btn btn-outline" type="button" onClick={() => setEmptyRoomsDemo(false)}>
            Show Fund A / Fund B
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="panel">
        <p className="screen-kicker">Rooms</p>
        <h1>Matter spaces.</h1>
        <p className="lede">
          Isolation first. A partner may see both funds; an associate may see one. Permission is
          checked before retrieve. There is no cross-room search.
        </p>
        <div className="room-list">
          {visibleRooms.map((room) => {
            const empty = !room.files.length && !(threads[room.id] || []).length;
            const current = room.id === currentRoomId;
            return (
              <button
                key={room.id}
                className={`room-card${current ? " is-current" : ""}`}
                type="button"
                onClick={() => {
                  setRoom(room.id);
                  router.push("/ask");
                }}
              >
                <span className="room-name">{room.name}</span>
                <span className={`pill ${current ? "pill-ink" : "pill-mute"}`}>
                  {current ? "Current" : "Enter"}
                </span>
                <p className="fine">
                  {empty
                    ? "This room has no files and no threads. Upload in Library or ask a question that does not need the library."
                    : `${room.files.length} files · isolated from the other fund`}
                </p>
              </button>
            );
          })}
        </div>
        <p className="fine" style={{ marginTop: 16 }}>
          {currentRoom.isolation}{" "}
          <button className="linkish" type="button" onClick={() => setEmptyRoomsDemo(true)}>
            Show empty rooms
          </button>
        </p>
      </div>
    </Shell>
  );
}
