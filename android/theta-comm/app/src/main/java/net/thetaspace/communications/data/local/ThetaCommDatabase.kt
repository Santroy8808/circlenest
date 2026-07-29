package net.thetaspace.communications.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        ConversationEntity::class,
        ParticipantEntity::class,
        MessageEntity::class,
        ReceiptEntity::class,
        AttachmentEntity::class,
        DraftEntity::class,
        PendingOperationEntity::class,
        SyncStateEntity::class,
        SignalRecordEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
abstract class ThetaCommDatabase : RoomDatabase() {
    abstract fun thetaCommDao(): ThetaCommDao

    companion object {
        fun create(context: Context): ThetaCommDatabase =
            Room.databaseBuilder(
                context.applicationContext,
                ThetaCommDatabase::class.java,
                "theta_comm_v2.db",
            )
                .addMigrations(MIGRATION_1_2)
                .fallbackToDestructiveMigrationOnDowngrade()
                .build()

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE attachments ADD COLUMN encryptedSizeBytes INTEGER")
                db.execSQL("ALTER TABLE attachments ADD COLUMN thumbnailCiphertextSha256 TEXT")
                db.execSQL("ALTER TABLE attachments ADD COLUMN sealedEncryptionKey TEXT")
                db.execSQL("ALTER TABLE attachments ADD COLUMN sealedNonce TEXT")
                db.execSQL("ALTER TABLE attachments ADD COLUMN sealedThumbnailKey TEXT")
                db.execSQL("ALTER TABLE attachments ADD COLUMN sealedThumbnailNonce TEXT")
                db.execSQL("ALTER TABLE attachments ADD COLUMN serverAttachmentId TEXT")
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_attachments_serverAttachmentId " +
                        "ON attachments(serverAttachmentId)",
                )
            }
        }
    }
}
