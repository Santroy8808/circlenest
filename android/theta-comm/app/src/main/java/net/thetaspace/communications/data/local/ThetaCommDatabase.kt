package net.thetaspace.communications.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

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
    version = 1,
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
                .fallbackToDestructiveMigrationOnDowngrade()
                .build()
    }
}
