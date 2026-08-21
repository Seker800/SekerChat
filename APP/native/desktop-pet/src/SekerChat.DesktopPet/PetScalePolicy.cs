namespace SekerChat.DesktopPet;

public static class PetScalePolicy
{
    public static readonly double[] Presets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];

    public static double Normalize(double scale)
    {
        if (double.IsNaN(scale) || double.IsInfinity(scale))
        {
            return 0.5;
        }

        return Math.Clamp(scale, Presets[0], Presets[^1]);
    }
}
