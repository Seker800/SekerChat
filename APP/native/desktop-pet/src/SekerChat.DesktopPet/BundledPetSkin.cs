using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;

namespace SekerChat.DesktopPet;

public static class BundledPetSkin
{
    public const string ResourceName = "SekerChat.DesktopPet.PrivateSkin.zip";

    public static PetSkin? TryLoad(Stream archive, string cacheDirectory)
    {
        string? staging = null;
        try
        {
            var digest = Convert.ToHexString(SHA256.HashData(archive));
            archive.Position = 0;
            var destination = Path.Combine(cacheDirectory, digest);
            var cached = PetSkin.TryLoad(destination);
            if (cached is not null) return cached;

            Directory.CreateDirectory(cacheDirectory);
            staging = Path.Combine(cacheDirectory, digest + "." + Guid.NewGuid().ToString("N") + ".tmp");
            // The framework rejects entries escaping this newly created staging directory.
            ZipFile.ExtractToDirectory(archive, staging);
            if (PetSkin.TryLoad(staging) is null) return null;
            if (Directory.Exists(destination)) Directory.Delete(destination, recursive: true);
            Directory.Move(staging, destination);
            return PetSkin.TryLoad(destination);
        }
        catch (Exception exception) when (exception is IOException or InvalidDataException
            or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return null;
        }
        finally
        {
            if (staging is not null && Directory.Exists(staging))
            {
                try { Directory.Delete(staging, recursive: true); }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }
    }
}
