using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Orders;

public enum BulkUploadStatus
{
    Validated,
    Rejected,
    Submitted,
}

/// <summary>
/// A CSV batch of orders. Rows are validated as a whole first; the batch is only submittable
/// when every row is valid (all-or-nothing), which avoids partial batches that partners then
/// have to reconcile by hand.
/// </summary>
public sealed class BulkUpload : Entity
{
    public const int MaxRows = 2_000;

    private BulkUpload()
    {
    }

    public BulkUpload(Guid partnerId, string fileName, string contentSha256, int rowCount, IReadOnlyCollection<BulkRowError> errors, DateTimeOffset now, string uploadedBy)
    {
        PartnerId = partnerId;
        FileName = fileName;
        ContentSha256 = contentSha256;
        RowCount = rowCount;
        Errors = errors.ToList();
        Status = Errors.Count == 0 ? BulkUploadStatus.Validated : BulkUploadStatus.Rejected;
        UploadedBy = uploadedBy;
        Touch(now);
    }

    public Guid PartnerId { get; private set; }

    public string FileName { get; private set; } = string.Empty;

    public string ContentSha256 { get; private set; } = string.Empty;

    public int RowCount { get; private set; }

    public BulkUploadStatus Status { get; private set; }

    public List<BulkRowError> Errors { get; private set; } = new();

    public int OrdersCreated { get; private set; }

    public string UploadedBy { get; private set; } = string.Empty;

    public void MarkSubmitted(int ordersCreated, DateTimeOffset now)
    {
        if (Status != BulkUploadStatus.Validated)
        {
            throw new DomainException("bulk.not_submittable", "Only fully valid uploads can be submitted.");
        }

        Status = BulkUploadStatus.Submitted;
        OrdersCreated = ordersCreated;
        Touch(now);
    }
}

public sealed record BulkRowError(int Row, string Column, string Code, string Message);
