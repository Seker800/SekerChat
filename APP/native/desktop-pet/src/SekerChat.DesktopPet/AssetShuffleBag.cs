namespace SekerChat.DesktopPet;

public sealed class AssetShuffleBag(Random? random = null)
{
    private readonly Random _random = random ?? Random.Shared;
    private Queue<string> _remaining = new();
    private string? _lastAsset;

    public string Next(IReadOnlyList<string> assets)
    {
        ArgumentNullException.ThrowIfNull(assets);
        if (assets.Count == 0)
        {
            throw new ArgumentException("Asset pool cannot be empty.", nameof(assets));
        }

        if (_remaining.Count == 0)
        {
            Refill(assets);
        }

        _lastAsset = _remaining.Dequeue();
        return _lastAsset;
    }

    private void Refill(IReadOnlyList<string> assets)
    {
        var shuffled = assets.ToArray();
        for (var index = shuffled.Length - 1; index > 0; index--)
        {
            var swapIndex = _random.Next(index + 1);
            (shuffled[index], shuffled[swapIndex]) = (shuffled[swapIndex], shuffled[index]);
        }

        if (shuffled.Length > 1 && shuffled[0] == _lastAsset)
        {
            var swapIndex = Array.FindIndex(shuffled, 1, asset => asset != _lastAsset);
            (shuffled[0], shuffled[swapIndex]) = (shuffled[swapIndex], shuffled[0]);
        }

        _remaining = new Queue<string>(shuffled);
    }
}
