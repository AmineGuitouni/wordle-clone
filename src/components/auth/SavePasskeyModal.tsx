"use client";

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import SavePasskey from "./SavePasskey";

export default function SavePasskeyModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} backdrop="blur" placement="center" size="sm">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="font-display text-xl">Play on your other devices</ModalHeader>
            <ModalBody className="gap-3 text-sm text-foreground/80">
              <p>
                Your games are tied to this browser. A passkey (Face ID, Touch ID, Windows Hello or your phone) lets you
                pick up where you left off anywhere, and it syncs through your password manager.
              </p>
              <SavePasskey />
            </ModalBody>
            <ModalFooter>
              <Button variant="light" radius="lg" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
