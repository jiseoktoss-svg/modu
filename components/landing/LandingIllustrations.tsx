import Image from "next/image";

type ClayAssetProps = {
  src: string;
};

function ClayAsset({ src }: ClayAssetProps) {
  return (
    <Image
      src={src}
      alt=""
      width={1448}
      height={1086}
      aria-hidden="true"
      draggable={false}
      sizes="(min-width: 640px) 320px, 80vw"
      className="mx-auto h-auto w-full max-w-[320px] select-none rounded-[2rem] object-contain"
    />
  );
}

export function InviteClay() {
  return <ClayAsset src="/landing/invite-clay.png" />;
}

export function TimeClay() {
  return <ClayAsset src="/landing/time-clay.png" />;
}

export function ConfirmClay() {
  return <ClayAsset src="/landing/confirm-clay.png" />;
}
