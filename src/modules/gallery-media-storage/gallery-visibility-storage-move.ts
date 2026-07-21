import {
  copyR2Object,
  deleteR2Object,
  verifyR2Object,
  verifyR2ObjectAbsent,
  type R2ObjectAccess
} from "@/lib/platform/r2";

export type GalleryVisibilityStorageObject = {
  storageKey: string;
  label: string;
  expectedSizeBytes?: number;
  expectedMimeType?: string;
};

export type GalleryVisibilityStorageMovePhase =
  | "COPY_DESTINATION"
  | "VERIFY_DESTINATION"
  | "DELETE_SOURCE"
  | "VERIFY_SOURCE_ABSENCE";

type StorageVerificationResult = { ok: true } | { ok: false; error: string };

export type GalleryVisibilityStorageMoveOperations = {
  copyDestination: (
    object: GalleryVisibilityStorageObject,
    sourceAccess: R2ObjectAccess,
    destinationAccess: R2ObjectAccess
  ) => Promise<unknown>;
  verifyDestination: (
    object: GalleryVisibilityStorageObject,
    destinationAccess: R2ObjectAccess
  ) => Promise<StorageVerificationResult>;
  deleteSource: (object: GalleryVisibilityStorageObject, sourceAccess: R2ObjectAccess) => Promise<unknown>;
  verifySourceAbsent: (
    object: GalleryVisibilityStorageObject,
    sourceAccess: R2ObjectAccess
  ) => Promise<StorageVerificationResult>;
};

export type GalleryVisibilityStorageMoveProgress = {
  destinationVerifiedStorageKeys: string[];
  sourceAbsentStorageKeys: string[];
  pendingStorageKeys: string[];
  failedStorageKey: string | null;
  failedPhase: GalleryVisibilityStorageMovePhase | null;
};

export type GalleryVisibilityStorageMoveResult =
  | {
      ok: true;
      progress: GalleryVisibilityStorageMoveProgress;
    }
  | {
      ok: false;
      code: "GALLERY_STORAGE_MOVE_INCOMPLETE";
      retryable: true;
      error: string;
      progress: GalleryVisibilityStorageMoveProgress;
    };

const defaultOperations: GalleryVisibilityStorageMoveOperations = {
  copyDestination: (object, sourceAccess, destinationAccess) =>
    copyR2Object(object.storageKey, sourceAccess, destinationAccess),
  verifyDestination: (object, destinationAccess) =>
    verifyR2Object({
      storageKey: object.storageKey,
      expectedSizeBytes: object.expectedSizeBytes,
      expectedMimeType: object.expectedMimeType,
      access: destinationAccess,
      label: object.label
    }),
  deleteSource: (object, sourceAccess) => deleteR2Object(object.storageKey, sourceAccess),
  verifySourceAbsent: (object, sourceAccess) => verifyR2ObjectAbsent(object.storageKey, sourceAccess)
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Media storage operation failed.";
}

function incompleteMove(
  objects: GalleryVisibilityStorageObject[],
  destinationVerifiedStorageKeys: string[],
  sourceAbsentStorageKeys: string[],
  failedObject: GalleryVisibilityStorageObject,
  failedPhase: GalleryVisibilityStorageMovePhase,
  error: string
): GalleryVisibilityStorageMoveResult {
  const completed = new Set(sourceAbsentStorageKeys);
  return {
    ok: false,
    code: "GALLERY_STORAGE_MOVE_INCOMPLETE",
    retryable: true,
    error,
    progress: {
      destinationVerifiedStorageKeys,
      sourceAbsentStorageKeys,
      pendingStorageKeys: objects.map((object) => object.storageKey).filter((storageKey) => !completed.has(storageKey)),
      failedStorageKey: failedObject.storageKey,
      failedPhase
    }
  };
}

export async function moveGalleryVisibilityStorageObjects(
  input: {
    objects: GalleryVisibilityStorageObject[];
    sourceAccess: R2ObjectAccess;
    destinationAccess: R2ObjectAccess;
  },
  operations: GalleryVisibilityStorageMoveOperations = defaultOperations
): Promise<GalleryVisibilityStorageMoveResult> {
  const destinationVerifiedStorageKeys: string[] = [];
  const sourceAbsentStorageKeys: string[] = [];

  for (const object of input.objects) {
    let destinationVerification: StorageVerificationResult;
    try {
      destinationVerification = await operations.verifyDestination(object, input.destinationAccess);
    } catch {
      destinationVerification = { ok: false, error: "Destination verification failed." };
    }

    if (!destinationVerification.ok) {
      try {
        await operations.copyDestination(object, input.sourceAccess, input.destinationAccess);
      } catch (error) {
        return incompleteMove(
          input.objects,
          destinationVerifiedStorageKeys,
          sourceAbsentStorageKeys,
          object,
          "COPY_DESTINATION",
          errorMessage(error)
        );
      }

      try {
        destinationVerification = await operations.verifyDestination(object, input.destinationAccess);
      } catch (error) {
        return incompleteMove(
          input.objects,
          destinationVerifiedStorageKeys,
          sourceAbsentStorageKeys,
          object,
          "VERIFY_DESTINATION",
          errorMessage(error)
        );
      }

      if (!destinationVerification.ok) {
        return incompleteMove(
          input.objects,
          destinationVerifiedStorageKeys,
          sourceAbsentStorageKeys,
          object,
          "VERIFY_DESTINATION",
          destinationVerification.error
        );
      }
    }

    destinationVerifiedStorageKeys.push(object.storageKey);
  }

  for (const object of input.objects) {
    try {
      await operations.deleteSource(object, input.sourceAccess);
    } catch (error) {
      return incompleteMove(
        input.objects,
        destinationVerifiedStorageKeys,
        sourceAbsentStorageKeys,
        object,
        "DELETE_SOURCE",
        errorMessage(error)
      );
    }

    let sourceAbsence: StorageVerificationResult;
    try {
      sourceAbsence = await operations.verifySourceAbsent(object, input.sourceAccess);
    } catch (error) {
      return incompleteMove(
        input.objects,
        destinationVerifiedStorageKeys,
        sourceAbsentStorageKeys,
        object,
        "VERIFY_SOURCE_ABSENCE",
        errorMessage(error)
      );
    }

    if (!sourceAbsence.ok) {
      return incompleteMove(
        input.objects,
        destinationVerifiedStorageKeys,
        sourceAbsentStorageKeys,
        object,
        "VERIFY_SOURCE_ABSENCE",
        sourceAbsence.error
      );
    }

    sourceAbsentStorageKeys.push(object.storageKey);
  }

  return {
    ok: true,
    progress: {
      destinationVerifiedStorageKeys,
      sourceAbsentStorageKeys,
      pendingStorageKeys: [],
      failedStorageKey: null,
      failedPhase: null
    }
  };
}
